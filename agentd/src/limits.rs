//! What a full account means for a tab: Claude's rate-limit events say when a turn hit the
//! limit, the policy and the other accounts' quota say whether the chat moves or waits.

use std::io;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::catalog::Profile;
use crate::paths::APP_FOLDER;
use crate::protocol::{AccountRef, LimitPolicy, QueuedPrompt};
use crate::quota::AccountQuota;
use crate::usage;

pub const FIVE_HOUR: &str = "five_hour";
pub const SEVEN_DAY: &str = "seven_day";
/// The 5-hour window from which the move is suggested, in percent.
pub const SUGGEST_FROM_PERCENT: f64 = 90.0;
const FULL_PERCENT: f64 = 100.0;
const POLICY_FILE: &str = "limits.json";

/// What Claude's last `rate_limit_event` said about the tab's account.
#[derive(Debug, Clone, PartialEq)]
pub struct RateInfo {
    pub is_rejected: bool,
    /// `five_hour`, `seven_day`, …: the window that decides.
    pub window: Option<String>,
    pub resets_at_ms: Option<u64>,
    pub five_hour_percent: Option<f64>,
    pub five_hour_resets_ms: Option<u64>,
}

pub fn rate_info_of(event: &Value) -> Option<RateInfo> {
    if event["type"] != "rate_limit_event" {
        return None;
    }
    let info = &event["rate_limit_info"];
    let five_hour = &info["unifiedWindows"][FIVE_HOUR];
    Some(RateInfo {
        is_rejected: info["status"] == "rejected",
        window: info["rateLimitType"].as_str().map(str::to_string),
        resets_at_ms: seconds_to_ms(&info["resetsAt"]),
        five_hour_percent: five_hour["utilization"].as_f64().map(|share| share * FULL_PERCENT),
        five_hour_resets_ms: seconds_to_ms(&five_hour["resetsAt"]),
    })
}

fn seconds_to_ms(value: &Value) -> Option<u64> {
    value.as_u64().map(|seconds| seconds * 1000)
}

/// A turn that failed. Whether the account was full says the rate-limit event, or, for a spend
/// limit or an older Claude Code without the event, Claude's own wording.
pub fn is_failed_result(event: &Value) -> bool {
    event["type"] == "result" && event["is_error"] == true
}

pub fn says_limit(event: &Value) -> bool {
    event["result"].as_str().is_some_and(|text| text.contains("hit your") && text.contains("limit"))
}

/// The repository a chat works in; a worktree counts as its main checkout, so one rule covers both.
pub fn project_of(cwd: &Path) -> String {
    let root = usage::repository_root(cwd).unwrap_or_else(|| cwd.to_path_buf());
    root.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Profiles in the policy's order; the ones it does not name follow by label.
pub fn ordered<'a>(policy: &LimitPolicy, profiles: &'a [Profile]) -> Vec<&'a Profile> {
    let rank = |profile: &Profile| policy.order.iter().position(|label| *label == profile.label).unwrap_or(usize::MAX);
    let mut sorted: Vec<&Profile> = profiles.iter().collect();
    sorted.sort_by(|a, b| rank(a).cmp(&rank(b)).then_with(|| a.label.cmp(&b.label)));
    sorted
}

/// The labels a folder's rule allows; `None` when no rule names the folder (every account then).
pub fn allowed_labels<'a>(policy: &'a LimitPolicy, project: &str) -> Option<&'a [String]> {
    policy.rules.iter().find(|rule| rule.folder.eq_ignore_ascii_case(project)).map(|rule| rule.accounts.as_slice())
}

/// Accounts with room in both windows a chat could move to, best first. With `respect_rule`
/// off, the folder's rule is ignored: an offer the user may take once against it. A profile on
/// the current one's login is never offered: it shares the full quota.
pub fn candidates(
    policy: &LimitPolicy,
    project: &str,
    current: &Path,
    profiles: &[Profile],
    quotas: &[AccountQuota],
    respect_rule: bool,
) -> Vec<AccountRef> {
    let allowed = if respect_rule { allowed_labels(policy, project) } else { None };
    let current_email = profiles.iter().find(|profile| profile.dir == current).and_then(|profile| profile.email.as_deref());
    ordered(policy, profiles)
        .into_iter()
        .filter(|profile| profile.dir != current)
        .filter(|profile| current_email.is_none() || profile.email.as_deref() != current_email)
        .filter(|profile| allowed.is_none_or(|labels| labels.contains(&profile.label)))
        .filter_map(|profile| {
            let quota = quotas.iter().find(|quota| quota.profile == profile.dir)?;
            has_room(quota).then(|| account_ref(profile, Some(quota), FIVE_HOUR))
        })
        .collect()
}

fn has_room(quota: &AccountQuota) -> bool {
    if quota.problem.is_some_and(|problem| problem.is_lasting()) {
        return false;
    }
    [FIVE_HOUR, SEVEN_DAY].iter().all(|key| percent_of(quota, key).is_some_and(|percent| percent < FULL_PERCENT))
}

fn percent_of(quota: &AccountQuota, key: &str) -> Option<f64> {
    quota.windows.iter().find(|window| window.key == key).map(|window| window.used_percent)
}

fn resets_of(quota: &AccountQuota, key: &str) -> Option<u64> {
    let window = quota.windows.iter().find(|window| window.key == key)?;
    let at = chrono::DateTime::parse_from_rfc3339(window.resets_at.as_deref()?).ok()?;
    u64::try_from(at.timestamp_millis()).ok()
}

/// An account as a card shows it, with the numbers of `window`.
pub fn account_ref(profile: &Profile, quota: Option<&AccountQuota>, window: &str) -> AccountRef {
    AccountRef {
        profile: profile.dir.clone(),
        label: profile.label.clone(),
        used_percent: quota.and_then(|quota| percent_of(quota, window)),
        resets_at_ms: quota.and_then(|quota| resets_of(quota, window)),
    }
}

/// The window that is full: what Claude said, else the first one the quota shows at 100 %.
pub fn full_window(rate: Option<&RateInfo>, quota: Option<&AccountQuota>) -> Option<String> {
    let from_rate = rate.and_then(|rate| rate.window.clone());
    from_rate.or_else(|| {
        let quota = quota?;
        quota.windows.iter().find(|window| window.used_percent >= FULL_PERCENT).map(|window| window.key.clone())
    })
}

/// The full account: its reset from Claude's event, else from the quota of the full window.
pub fn full_account(profile: &Profile, quota: Option<&AccountQuota>, rate: Option<&RateInfo>, window: Option<&str>) -> AccountRef {
    let from_quota = account_ref(profile, quota, window.unwrap_or(FIVE_HOUR));
    AccountRef {
        used_percent: Some(FULL_PERCENT),
        resets_at_ms: rate.and_then(|rate| rate.resets_at_ms).or(from_quota.resets_at_ms),
        ..from_quota
    }
}

/// How a waiting message shows on the card: its text and how many images it carries.
pub fn queued_prompt(id: u64, content: &[Value]) -> QueuedPrompt {
    let text = content.iter().filter_map(|block| block["text"].as_str()).collect::<Vec<_>>().join("\n");
    let images = content.iter().filter(|block| block["type"] == "image").count();
    QueuedPrompt { id, text, images }
}

fn policy_path(home: &Path) -> PathBuf {
    home.join(APP_FOLDER).join(POLICY_FILE)
}

/// The policy the app sent last; the default until it sent one.
pub fn load_policy(home: &Path) -> LimitPolicy {
    let text = match std::fs::read_to_string(policy_path(home)) {
        Ok(text) => text,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return LimitPolicy::default(),
        Err(err) => {
            eprintln!("agentd: limits policy unreadable, using the default: {err}");
            return LimitPolicy::default();
        }
    };
    serde_json::from_str(&text).unwrap_or_else(|err| {
        eprintln!("agentd: limits policy invalid, using the default: {err}");
        LimitPolicy::default()
    })
}

pub fn save_policy(home: &Path, policy: &LimitPolicy) -> io::Result<()> {
    let path = policy_path(home);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(policy)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{FolderRule, LimitMode};
    use crate::quota::{QuotaProblem, QuotaSource, QuotaWindow};
    use serde_json::json;

    fn profile(label: &str) -> Profile {
        Profile { label: label.into(), dir: PathBuf::from(format!("/home/.claude-{label}")), email: None }
    }

    fn quota(label: &str, five_hour: f64, seven_day: f64) -> AccountQuota {
        let window = |key: &str, used_percent| QuotaWindow {
            key: key.into(),
            used_percent,
            resets_at: Some("2026-11-18T03:25:00+00:00".into()),
        };
        AccountQuota {
            profile: profile(label).dir,
            label: label.into(),
            email: None,
            plan: None,
            windows: vec![window(FIVE_HOUR, five_hour), window(SEVEN_DAY, seven_day)],
            fetched_ms: 1,
            problem: None,
            source: QuotaSource::Anthropic,
        }
    }

    fn policy(order: &[&str], rules: &[(&str, &[&str])]) -> LimitPolicy {
        LimitPolicy {
            mode: LimitMode::Auto,
            order: order.iter().map(|label| label.to_string()).collect(),
            rules: rules
                .iter()
                .map(|(folder, accounts)| FolderRule {
                    folder: folder.to_string(),
                    accounts: accounts.iter().map(|label| label.to_string()).collect(),
                })
                .collect(),
            ..LimitPolicy::default()
        }
    }

    fn labels(refs: &[AccountRef]) -> Vec<&str> {
        refs.iter().map(|account| account.label.as_str()).collect()
    }

    #[test]
    fn reads_a_rejected_rate_limit_event() {
        let event = json!({ "type": "rate_limit_event", "rate_limit_info": { "status": "rejected",
            "resetsAt": 1_794_972_600, "rateLimitType": "five_hour",
            "unifiedWindows": { "five_hour": { "utilization": 1.0, "resetsAt": 1_794_972_600 } } } });
        let info = rate_info_of(&event).unwrap();
        assert_eq!(info, RateInfo {
            is_rejected: true,
            window: Some("five_hour".into()),
            resets_at_ms: Some(1_794_972_600_000),
            five_hour_percent: Some(100.0),
            five_hour_resets_ms: Some(1_794_972_600_000),
        });
    }

    #[test]
    fn ignores_other_events_and_allowed_status() {
        assert_eq!(rate_info_of(&json!({ "type": "result" })), None);
        let allowed = json!({ "type": "rate_limit_event", "rate_limit_info": { "status": "allowed_warning" } });
        assert!(!rate_info_of(&allowed).unwrap().is_rejected);
    }

    #[test]
    fn recognises_the_limit_wording_of_a_failed_turn() {
        let failed = json!({ "type": "result", "is_error": true,
            "result": "You've hit your monthly spend limit · your 5-hour limit resets 5:40pm" });
        assert!(is_failed_result(&failed) && says_limit(&failed));
        let other = json!({ "type": "result", "is_error": true, "result": "Login expired" });
        assert!(is_failed_result(&other) && !says_limit(&other));
    }

    #[test]
    fn offers_accounts_with_room_in_the_policy_order_without_the_current() {
        let profiles = [profile("default"), profile("office"), profile("privat")];
        let quotas = [quota("default", 10.0, 10.0), quota("office", 42.0, 63.0), quota("privat", 100.0, 71.0)];
        let found = candidates(&policy(&["office"], &[]), "bull", &profile("privat").dir, &profiles, &quotas, true);
        assert_eq!(labels(&found), vec!["office", "default"]);
        assert_eq!(found[0].used_percent, Some(42.0));
    }

    #[test]
    fn never_offers_a_profile_on_the_same_login() {
        let on_login = |label: &str, email: &str| Profile { email: Some(email.into()), ..profile(label) };
        let profiles = [on_login("default", "me@example.com"), on_login("gmail", "me@example.com"), on_login("office", "work@example.com")];
        let quotas = [quota("default", 100.0, 40.0), quota("gmail", 10.0, 40.0), quota("office", 10.0, 10.0)];
        let found = candidates(&LimitPolicy::default(), "bull", &profile("default").dir, &profiles, &quotas, true);
        assert_eq!(labels(&found), vec!["office"]);
    }

    #[test]
    fn a_folder_rule_restricts_the_accounts_case_insensitive() {
        let profiles = [profile("office"), profile("privat"), profile("spare")];
        let quotas = [quota("office", 10.0, 10.0), quota("privat", 100.0, 10.0), quota("spare", 10.0, 10.0)];
        let rules = policy(&[], &[("Kramlos", &["privat", "spare"])]);
        let found = candidates(&rules, "kramlos", &profile("privat").dir, &profiles, &quotas, true);
        assert_eq!(labels(&found), vec!["spare"]);
        let ignored = candidates(&rules, "kramlos", &profile("privat").dir, &profiles, &quotas, false);
        assert_eq!(labels(&ignored), vec!["office", "spare"]);
    }

    #[test]
    fn skips_full_weeks_logged_out_accounts_and_missing_numbers() {
        let profiles = [profile("a"), profile("b"), profile("c"), profile("d")];
        let mut logged_out = quota("b", 10.0, 10.0);
        logged_out.problem = Some(QuotaProblem::LoggedOut);
        let quotas = [quota("a", 10.0, 100.0), logged_out];
        let found = candidates(&LimitPolicy::default(), "x", &profile("d").dir, &profiles, &quotas, true);
        assert_eq!(labels(&found), Vec::<&str>::new());
    }

    #[test]
    fn the_full_account_takes_the_reset_from_claude_before_the_quota() {
        let rate = RateInfo { is_rejected: true, window: Some("seven_day".into()), resets_at_ms: Some(5), five_hour_percent: None, five_hour_resets_ms: None };
        let full = full_account(&profile("privat"), Some(&quota("privat", 100.0, 71.0)), Some(&rate), Some("seven_day"));
        assert_eq!((full.used_percent, full.resets_at_ms), (Some(100.0), Some(5)));
        let from_quota = full_account(&profile("privat"), Some(&quota("privat", 100.0, 71.0)), None, Some(FIVE_HOUR));
        assert_eq!(from_quota.resets_at_ms, Some(1_794_972_300_000));
    }

    #[test]
    fn the_full_window_comes_from_claude_or_the_quota() {
        let full = quota("privat", 100.0, 71.0);
        assert_eq!(full_window(None, Some(&full)), Some("five_hour".into()));
        assert_eq!(full_window(None, Some(&quota("privat", 10.0, 10.0))), None);
    }

    #[test]
    fn summarises_a_waiting_message() {
        let content = [json!({ "type": "text", "text": "Termine über Mitternacht" }), json!({ "type": "image", "source": {} })];
        assert_eq!(queued_prompt(3, &content), QueuedPrompt { id: 3, text: "Termine über Mitternacht".into(), images: 1 });
    }

    #[test]
    fn a_worktree_belongs_to_its_repository() {
        let root = std::env::temp_dir().join(format!("agentd-limits-{}", std::process::id()));
        let repo = root.join("nexron-chat");
        std::fs::create_dir_all(repo.join(".git").join("worktrees").join("limits")).unwrap();
        let worktree = root.join("worktrees").join("nexron-chat-limits");
        std::fs::create_dir_all(&worktree).unwrap();
        let gitdir = repo.join(".git").join("worktrees").join("limits");
        std::fs::write(worktree.join(".git"), format!("gitdir: {}", gitdir.display())).unwrap();
        assert_eq!(project_of(&worktree), "nexron-chat");
        assert_eq!(project_of(&repo.join("src")), "nexron-chat");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn keeps_the_policy_on_disk() {
        let home = std::env::temp_dir().join(format!("agentd-limits-home-{}", std::process::id()));
        assert_eq!(load_policy(&home), LimitPolicy::default());
        let saved = policy(&["office"], &[("kramlos", &["privat"])]);
        save_policy(&home, &saved).unwrap();
        assert_eq!(load_policy(&home), saved);
        std::fs::remove_dir_all(home).unwrap();
    }
}

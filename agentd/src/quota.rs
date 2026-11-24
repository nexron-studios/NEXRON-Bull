//! Plan quota (5-hour and weekly windows) per Claude profile on this machine.
//!
//! Ported from the Agent Dashboard (`src-tauri/src/quota.rs`): the undocumented `oauth/usage`
//! endpoint, called with the token the CLI keeps in `.credentials.json` (or the macOS keychain).
//! It lives in agentd so another machine answers for its own logins, like `profiles`.
//!
//! The token is never refreshed here. Only the CLI that issued it may rotate it; an expired token
//! keeps the last known numbers until the next `claude` run renews it.
//!
//! While NEXRON TokenScope runs here, its numbers come first (see `tokenscope.rs`): a login it
//! covers is not asked at Anthropic at all. Only the rest, or everything when TokenScope is down
//! (always on a remote machine), goes through the own request below.

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

use crate::catalog::Profile;
use crate::claude::hide_console;
use crate::tokenscope::{self, ScopedAccount, TokenScope, TokenScopeError};

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
/// Names the plan as claude.ai does (`plan_display_label`: "Ultra plan"). The login only knows the
/// billing family: an Ultra account says `max` there, and its `rateLimitTier` is the one of login day.
const PROFILE_URL: &str = "https://api.anthropic.com/api/oauth/profile";
const PLAN_LABEL_SUFFIX: &str = " plan";
/// A plan changes rarely; the label is asked once an hour per profile, not every quota round.
const PLAN_LABEL_INTERVAL: Duration = Duration::from_secs(60 * 60);
const OAUTH_BETA: &str = "oauth-2025-04-20";
const CREDENTIALS_FILE: &str = ".credentials.json";
/// `default_claude_max_5x`, `default_claude_ai`: the plan is the word after the prefix.
const RATE_LIMIT_TIER_PREFIX: &str = "default_claude_";
/// Free and Pro share this tier, so it names no plan.
const BASE_RATE_LIMIT_TIER: &str = "ai";

const REQUEST_TIMEOUT_SECS: &str = "10";
/// The endpoint answers 429 quickly, and the Agent Dashboard and TokenScope may poll it too.
const MIN_FETCH_INTERVAL: Duration = Duration::from_secs(90);
/// A refresh the user asked for may come sooner, but not in a burst.
const MIN_FORCED_INTERVAL: Duration = Duration::from_secs(15);
const RATE_LIMIT_COOLDOWN: Duration = Duration::from_secs(300);
/// TokenScope's numbers count up to this age, also while it does not answer (a restart); older
/// ones mean it is stuck, and agentd asks itself. TokenScope polls every 60 s.
const TOKENSCOPE_MAX_AGE_MS: u64 = 10 * 60 * 1000;
/// Windows Bull shows, in this order. The response also carries internal codename buckets;
/// a window the plan does not have comes back as `null` and is left out.
pub(crate) const SHOWN_WINDOWS: [&str; 4] = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet"];
/// Without these two the format has changed; showing half of it would mislead.
const MAIN_WINDOWS: [&str; 2] = ["five_hour", "seven_day"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotaProblem {
    /// No `.credentials.json` (API key login or never logged in)
    NoLogin,
    /// `/logout` ran; the file is still there
    LoggedOut,
    /// The access token ran out; the next `claude` run renews it
    Expired,
    RateLimited,
    Unreachable,
    /// Anthropic answered with an unexpected status or body
    BadAnswer,
    /// TokenScope's numbers are older than its last attempt, and it gives no reason
    Stale,
}

impl QuotaProblem {
    /// A login that will not answer until someone logs in or Claude runs again.
    pub(crate) fn is_lasting(self) -> bool {
        matches!(self, Self::NoLogin | Self::LoggedOut | Self::Expired)
    }
}

/// Who fetched the numbers of an account.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum QuotaSource {
    Anthropic,
    TokenScope,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct QuotaWindow {
    /// `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`
    pub key: String,
    pub used_percent: f64,
    /// RFC 3339, as the endpoint sends it
    pub resets_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AccountQuota {
    pub profile: PathBuf,
    pub label: String,
    pub email: Option<String>,
    /// `pro`, `max`, `ultra`, … as claude.ai names it; `None` for an API key login
    pub plan: Option<String>,
    pub windows: Vec<QuotaWindow>,
    /// When `windows` were fetched (ms since epoch); 0 if never
    pub fetched_ms: u64,
    /// Why the numbers may be stale or missing; `None` when the last request succeeded
    pub problem: Option<QuotaProblem>,
    pub source: QuotaSource,
}

struct Entry {
    /// The last own request to Anthropic; kept while TokenScope answers, so a fallback still
    /// keeps the own intervals
    asked: Option<Instant>,
    blocked_until: Option<Instant>,
    quota: AccountQuota,
}

#[derive(Default)]
pub struct QuotaCache {
    entries: Mutex<HashMap<PathBuf, Entry>>,
    tokenscope: TokenScope,
    /// Per profile: when the plan label was last asked, and the last label Anthropic gave.
    plan_labels: Mutex<HashMap<PathBuf, (Instant, Option<String>)>>,
    /// One round at a time; a second caller waits and then reads the fresh cache.
    fetching: Mutex<()>,
}

struct Credential {
    token: String,
    expires_at_ms: Option<u64>,
    is_logged_out: bool,
    plan: Option<String>,
}

impl QuotaCache {
    /// Asks every account at once, so a round takes as long as the slowest answer (curl gives up
    /// after 10 s), not the sum. Blocks; run it off the request thread. A caller arriving while a
    /// round runs waits for it and then reads that round's fresh entries from the cache: every
    /// profile was checked moments ago, so nothing is asked twice.
    pub fn current(&self, profiles: &[Profile], force: bool) -> Vec<AccountQuota> {
        self.current_with(profiles, force, tokenscope::fetch)
    }

    /// `scope` reads TokenScope; tests pass a fixture instead of the socket.
    fn current_with(
        &self,
        profiles: &[Profile],
        force: bool,
        scope: impl FnOnce() -> Result<Vec<ScopedAccount>, TokenScopeError>,
    ) -> Vec<AccountQuota> {
        // TokenScope down (empty) is the normal case after the transition and on every remote
        // machine: every login then asks Anthropic, as it did before TokenScope was read.
        let scoped = self.tokenscope.accounts(scope);
        let _round = self.fetching.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let now_ms = now_ms();
        let mut answers = Vec::with_capacity(profiles.len());
        let mut rest = Vec::new();
        for (index, profile) in profiles.iter().enumerate() {
            match scoped_account_of(&scoped, profile, now_ms) {
                Some(account) => answers.push((index, self.remember_scoped(profile, account))),
                None => rest.push((index, profile)),
            }
        }
        let groups = account_groups(rest);
        answers.extend(thread::scope(|scope| {
            let running: Vec<_> =
                groups.iter().map(|group| scope.spawn(move || self.for_account(group, force))).collect();
            // A panicked fetch leaves its profiles out of this round; the next one asks again.
            running.into_iter().filter_map(|handle| handle.join().ok()).flatten().collect::<Vec<_>>()
        }));
        answers.sort_by_key(|(index, _)| *index);
        answers.into_iter().map(|(_, quota)| quota).collect()
    }

    /// The profiles of one login, in order. A working answer is shared with the profiles after it;
    /// a failed one (logged out, expired) is not, the next profile tries with its own token.
    fn for_account(&self, group: &[(usize, &Profile)], force: bool) -> Vec<(usize, AccountQuota)> {
        let mut shared: Option<AccountQuota> = None;
        let mut answers = Vec::with_capacity(group.len());
        for &(index, profile) in group {
            let quota = match &shared {
                Some(known) => AccountQuota { profile: profile.dir.clone(), label: profile.label.clone(), ..known.clone() },
                None => self.for_profile(profile, force),
            };
            if shared.is_none() && quota.problem.is_none() {
                shared = Some(quota.clone());
            }
            answers.push((index, quota));
        }
        answers
    }

    /// Keeps the own request time and a 429 cooldown, for when agentd has to ask itself again.
    fn remember_scoped(&self, profile: &Profile, account: &ScopedAccount) -> AccountQuota {
        let quota = AccountQuota {
            profile: profile.dir.clone(),
            label: profile.label.clone(),
            email: profile.email.clone(),
            plan: read_credential(&profile.dir)
                .and_then(|credential| self.plan_label(profile, &credential).or(credential.plan))
                .or_else(|| account.plan.clone()),
            windows: account.windows.clone(),
            fetched_ms: account.fetched_ms,
            problem: account.problem,
            source: QuotaSource::TokenScope,
        };
        let mut entries = self.entries();
        let (asked, blocked_until) = entries.get(&profile.dir).map_or((None, None), |e| (e.asked, e.blocked_until));
        entries.insert(profile.dir.clone(), Entry { asked, blocked_until, quota: quota.clone() });
        quota
    }

    fn for_profile(&self, profile: &Profile, force: bool) -> AccountQuota {
        let now = Instant::now();
        let min_interval = if force { MIN_FORCED_INTERVAL } else { MIN_FETCH_INTERVAL };
        let previous = match self.entries().get(&profile.dir) {
            Some(e) if e.quota.source == QuotaSource::TokenScope && trusts_scoped(e.quota.fetched_ms, e.quota.problem, now_ms()) => {
                return e.quota.clone()
            }
            Some(e) if e.blocked_until.is_some_and(|until| now < until) => return e.quota.clone(),
            Some(e) if e.asked.is_some_and(|asked| now.duration_since(asked) < min_interval) => return e.quota.clone(),
            Some(e) => Some(e.quota.clone()),
            None => None,
        };
        let mut quota = previous.unwrap_or_else(|| AccountQuota {
            profile: profile.dir.clone(),
            label: profile.label.clone(),
            email: profile.email.clone(),
            plan: None,
            windows: Vec::new(),
            fetched_ms: 0,
            problem: None,
            source: QuotaSource::Anthropic,
        });
        let mut blocked_until = None;
        match read_credential(&profile.dir).ok_or(QuotaProblem::NoLogin).and_then(|credential| {
            quota.plan = self.plan_label(profile, &credential).or_else(|| credential.plan.clone());
            fetch(&credential)
        }) {
            Ok(windows) => {
                quota.windows = windows;
                quota.fetched_ms = now_ms();
                quota.problem = None;
            }
            Err(problem) => {
                if problem == QuotaProblem::RateLimited {
                    blocked_until = Some(now + RATE_LIMIT_COOLDOWN);
                }
                quota.problem = Some(problem);
            }
        }
        // The problem is now this request's, even where the numbers are still TokenScope's.
        quota.source = QuotaSource::Anthropic;
        self.entries().insert(profile.dir.clone(), Entry { asked: Some(now), blocked_until, quota: quota.clone() });
        quota
    }

    /// The plan as claude.ai names it, lower case like `subscriptionType` (`ultra`). A failed
    /// request keeps the last label until the next attempt an hour later.
    fn plan_label(&self, profile: &Profile, credential: &Credential) -> Option<String> {
        let known = self.plan_labels.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).get(&profile.dir).cloned();
        if let Some((asked, label)) = &known {
            if asked.elapsed() < PLAN_LABEL_INTERVAL {
                return label.clone();
            }
        }
        let label = fetch_plan_label(credential).or_else(|| known.and_then(|(_, label)| label));
        self.plan_labels
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(profile.dir.clone(), (Instant::now(), label.clone()));
        label
    }

    fn entries(&self) -> MutexGuard<'_, HashMap<PathBuf, Entry>> {
        self.entries.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// The login TokenScope has usable numbers for, matched by email; never for a profile without one.
fn scoped_account_of<'a>(scoped: &'a [ScopedAccount], profile: &Profile, now_ms: u64) -> Option<&'a ScopedAccount> {
    let email = profile.email.as_deref()?;
    scoped
        .iter()
        .find(|account| account.email.eq_ignore_ascii_case(email))
        .filter(|account| trusts_scoped(account.fetched_ms, account.problem, now_ms))
}

/// TokenScope's numbers count while they are recent and its login still works.
fn trusts_scoped(fetched_ms: u64, problem: Option<QuotaProblem>, now_ms: u64) -> bool {
    now_ms.saturating_sub(fetched_ms) < TOKENSCOPE_MAX_AGE_MS && !problem.is_some_and(QuotaProblem::is_lasting)
}

pub(crate) fn has_main_windows(windows: &[QuotaWindow]) -> bool {
    MAIN_WINDOWS.iter().all(|key| windows.iter().any(|window| window.key == *key))
}

/// Profiles grouped by login email, each with its position; a profile without email stands alone.
fn account_groups(profiles: Vec<(usize, &Profile)>) -> Vec<Vec<(usize, &Profile)>> {
    let mut groups: Vec<Vec<(usize, &Profile)>> = Vec::new();
    for (index, profile) in profiles {
        let same = profile.email.as_ref().and_then(|email| {
            groups.iter_mut().find(|group| group.first().is_some_and(|(_, first)| first.email.as_ref() == Some(email)))
        });
        match same {
            Some(group) => group.push((index, profile)),
            None => groups.push(vec![(index, profile)]),
        }
    }
    groups
}

fn fetch(credential: &Credential) -> Result<Vec<QuotaWindow>, QuotaProblem> {
    if credential.is_logged_out {
        return Err(QuotaProblem::LoggedOut);
    }
    if credential.expires_at_ms.is_some_and(|expires| expires <= now_ms()) {
        return Err(QuotaProblem::Expired);
    }
    let (status, body) = curl_get(USAGE_URL, &credential.token)?;
    match status {
        200 => windows_of(&body),
        401 => Err(QuotaProblem::Expired),
        429 => Err(QuotaProblem::RateLimited),
        _ => Err(QuotaProblem::BadAnswer),
    }
}

fn fetch_plan_label(credential: &Credential) -> Option<String> {
    if credential.is_logged_out || credential.expires_at_ms.is_some_and(|expires| expires <= now_ms()) {
        return None;
    }
    match curl_get(PROFILE_URL, &credential.token).ok()? {
        (200, body) => plan_label_of(&body),
        _ => None,
    }
}

/// `"plan_display_label": "Ultra plan"` → `ultra`.
fn plan_label_of(body: &str) -> Option<String> {
    let payload: Value = serde_json::from_str(body).ok()?;
    let label = payload.get("organization")?.get("plan_display_label")?.as_str()?.trim().to_lowercase();
    let plan = label.strip_suffix(PLAN_LABEL_SUFFIX).unwrap_or(&label).trim();
    (!plan.is_empty()).then(|| plan.to_string())
}

fn windows_of(body: &str) -> Result<Vec<QuotaWindow>, QuotaProblem> {
    let payload: Value = serde_json::from_str(body).map_err(|_| QuotaProblem::BadAnswer)?;
    let windows: Vec<QuotaWindow> = SHOWN_WINDOWS
        .iter()
        .filter_map(|key| {
            let window = payload.get(key)?;
            Some(QuotaWindow {
                key: (*key).to_string(),
                used_percent: window.get("utilization")?.as_f64()?,
                resets_at: window.get("resets_at").and_then(Value::as_str).map(str::to_string),
            })
        })
        .collect();
    if !has_main_windows(&windows) {
        return Err(QuotaProblem::BadAnswer);
    }
    Ok(windows)
}

/// GET through the system curl (on Windows 10+ and macOS out of the box). The headers go in on
/// stdin (`-H @-`) so the bearer token never shows up in the process list.
fn curl_get(url: &str, token: &str) -> Result<(u16, String), QuotaProblem> {
    let mut command = Command::new("curl");
    command
        .args(["-s", "--max-time", REQUEST_TIMEOUT_SECS, "-H", "@-", "-w", "\n%{http_code}", url])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    // Polled every 90 s per account: without this a console flashes up each time on Windows.
    hide_console(&mut command);
    let mut child = command.spawn().map_err(|_| QuotaProblem::Unreachable)?;
    let headers = format!("Authorization: Bearer {token}\nanthropic-beta: {OAUTH_BETA}\nAccept: application/json\n");
    let mut stdin = child.stdin.take().ok_or(QuotaProblem::Unreachable)?;
    stdin.write_all(headers.as_bytes()).map_err(|_| QuotaProblem::Unreachable)?;
    drop(stdin);
    let output = child.wait_with_output().map_err(|_| QuotaProblem::Unreachable)?;
    let text = String::from_utf8_lossy(&output.stdout);
    let (body, status) = text.rsplit_once('\n').ok_or(QuotaProblem::Unreachable)?;
    match status.trim().parse::<u16>() {
        Ok(0) | Err(_) => Err(QuotaProblem::Unreachable),
        Ok(status) => Ok((status, body.to_string())),
    }
}

fn read_credential(dir: &Path) -> Option<Credential> {
    let raw = read_keychain(dir).or_else(|| std::fs::read_to_string(dir.join(CREDENTIALS_FILE)).ok())?;
    credential_of(&raw)
}

fn credential_of(raw: &str) -> Option<Credential> {
    let payload: Value = serde_json::from_str(raw.trim()).ok()?;
    let oauth = payload.get("claudeAiOauth").unwrap_or(&payload);
    Some(Credential {
        token: oauth.get("accessToken")?.as_str()?.to_string(),
        expires_at_ms: oauth.get("expiresAt").and_then(Value::as_u64),
        is_logged_out: oauth.get("loginEnded").is_some_and(|ended| !ended.is_null() && ended != false),
        plan: plan_of(oauth),
    })
}

/// The fallback while the plan label is out of reach: the CLI's `subscriptionType` (`pro`, `max`),
/// or, where a CLI writes none, the word in `rateLimitTier` (`default_claude_ultra` → `ultra`).
fn plan_of(oauth: &Value) -> Option<String> {
    let named = oauth.get("subscriptionType").and_then(Value::as_str).filter(|plan| !plan.is_empty());
    if let Some(plan) = named {
        return Some(plan.to_string());
    }
    let tier = oauth.get("rateLimitTier")?.as_str()?.strip_prefix(RATE_LIMIT_TIER_PREFIX)?;
    let plan = tier.split('_').next().filter(|plan| !plan.is_empty() && *plan != BASE_RATE_LIMIT_TIER)?;
    Some(plan.to_string())
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// The CLI stores the default `~/.claude` login under the plain service name, every other
/// config dir under the name plus the first 8 hex chars of the dir's SHA-256.
#[cfg(target_os = "macos")]
fn read_keychain(dir: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    const KEYCHAIN_SERVICE: &str = "Claude Code-credentials";
    let service = if dir.file_name().is_some_and(|name| name == ".claude") {
        KEYCHAIN_SERVICE.to_string()
    } else {
        let hash = Sha256::digest(dir.to_string_lossy().as_bytes());
        let hex: String = hash.iter().take(4).map(|b| format!("{b:02x}")).collect();
        format!("{KEYCHAIN_SERVICE}-{hex}")
    };
    let output = Command::new("security")
        .args(["find-generic-password", "-s", &service, "-w"])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok().filter(|s| !s.trim().is_empty())
}

#[cfg(not(target_os = "macos"))]
fn read_keychain(_dir: &Path) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_plan_expiry_and_logout_from_credentials() {
        let raw = r#"{"claudeAiOauth":{"accessToken":"t","expiresAt":5,"subscriptionType":"max","loginEnded":true}}"#;
        let credential = credential_of(raw).unwrap();
        assert_eq!(
            (credential.token.as_str(), credential.expires_at_ms, credential.plan.as_deref(), credential.is_logged_out),
            ("t", Some(5), Some("max"), true)
        );
        assert_eq!(fetch(&credential).err(), Some(QuotaProblem::LoggedOut));
    }

    #[test]
    fn names_a_plan_the_cli_does_not_know_by_its_rate_limit_tier() {
        let plan_of_raw = |oauth: &str| credential_of(&format!(r#"{{"claudeAiOauth":{{"accessToken":"t",{oauth}}}}}"#)).unwrap().plan;
        assert_eq!(
            [
                plan_of_raw(r#""subscriptionType":null,"rateLimitTier":"default_claude_ultra""#),
                plan_of_raw(r#""subscriptionType":"max","rateLimitTier":"default_claude_max_20x""#),
                plan_of_raw(r#""rateLimitTier":"default_claude_ai""#),
                plan_of_raw(r#""rateLimitTier":"something_else""#),
            ],
            [Some("ultra".to_string()), Some("max".to_string()), None, None]
        );
    }

    #[test]
    fn names_the_plan_as_claude_ai_does() {
        let label_of = |label: &str| plan_label_of(&format!(r#"{{"organization":{{"plan_display_label":{label}}}}}"#));
        assert_eq!(
            [label_of(r#""Ultra plan""#), label_of(r#""Max""#), label_of(r#""""#), label_of("null")],
            [Some("ultra".to_string()), Some("max".to_string()), None, None]
        );
        assert_eq!(plan_label_of(r#"{"organization":{}}"#), None);
    }

    #[test]
    fn expired_token_is_not_sent() {
        let raw = r#"{"claudeAiOauth":{"accessToken":"t","expiresAt":1}}"#;
        assert_eq!(fetch(&credential_of(raw).unwrap()).err(), Some(QuotaProblem::Expired));
    }

    #[test]
    fn keeps_known_windows_and_skips_missing_ones() {
        let body = r#"{"five_hour":{"utilization":42.0,"resets_at":"2026-11-15T20:00:00Z"},
            "seven_day":{"utilization":63.5,"resets_at":null},"seven_day_opus":null,"codename_x":{"utilization":1}}"#;
        let windows = windows_of(body).unwrap();
        let keys: Vec<_> = windows.iter().map(|w| (w.key.as_str(), w.used_percent)).collect();
        assert_eq!(keys, vec![("five_hour", 42.0), ("seven_day", 63.5)]);
        assert_eq!(windows[0].resets_at.as_deref(), Some("2026-11-15T20:00:00Z"));
    }

    #[test]
    fn groups_profiles_by_email_in_order() {
        let profile = |label: &str, email: Option<&str>| Profile {
            label: label.into(),
            dir: PathBuf::from(label),
            email: email.map(str::to_string),
        };
        let profiles = [profile("a", Some("x@y")), profile("b", None), profile("c", Some("x@y")), profile("d", None)];
        let labels: Vec<Vec<(usize, &str)>> = account_groups(profiles.iter().enumerate().collect())
            .iter()
            .map(|group| group.iter().map(|(index, p)| (*index, p.label.as_str())).collect())
            .collect();
        assert_eq!(labels, vec![vec![(0, "a"), (2, "c")], vec![(1, "b")], vec![(3, "d")]]);
    }

    #[test]
    fn a_failed_login_is_not_shared_with_the_next_profile() {
        let home = std::env::temp_dir().join(format!("agentd-quota-share-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let (out, expired) = (home.join(".claude-out"), home.join(".claude-expired"));
        std::fs::create_dir_all(&out).unwrap();
        std::fs::create_dir_all(&expired).unwrap();
        std::fs::write(out.join(CREDENTIALS_FILE), r#"{"claudeAiOauth":{"accessToken":"t","loginEnded":"time_limit"}}"#).unwrap();
        std::fs::write(expired.join(CREDENTIALS_FILE), r#"{"claudeAiOauth":{"accessToken":"t","expiresAt":1}}"#).unwrap();
        let email = Some("same@x".to_string());
        let profiles = [
            Profile { label: "out".into(), dir: out, email: email.clone() },
            Profile { label: "expired".into(), dir: expired, email },
        ];

        let problems: Vec<_> = QuotaCache::default()
            .current_with(&profiles, false, tokenscope_down)
            .iter()
            .map(|q| (q.label.clone(), q.problem))
            .collect();
        assert_eq!(
            problems,
            vec![("out".to_string(), Some(QuotaProblem::LoggedOut)), ("expired".to_string(), Some(QuotaProblem::Expired))]
        );
    }

    fn tokenscope_down() -> Result<Vec<ScopedAccount>, TokenScopeError> {
        Err(TokenScopeError::Status(503))
    }

    /// Profiles in folders without credentials: a login TokenScope does not cover ends at
    /// `NoLogin` before any request goes out.
    fn profiles_without_credentials() -> [Profile; 3] {
        let dir = |name: &str| std::env::temp_dir().join(format!("agentd-quota-scope-{}-{name}", std::process::id()));
        [
            Profile { label: "work".into(), dir: dir("work"), email: Some("WORK@example.com".into()) },
            Profile { label: "other".into(), dir: dir("other"), email: Some("other@example.com".into()) },
            Profile { label: "bare".into(), dir: dir("bare"), email: None },
        ]
    }

    const MINUTE_MS: u64 = 60 * 1000;

    fn scoped_work(plan: Option<&str>, fetched_ms: u64, problem: Option<QuotaProblem>) -> ScopedAccount {
        ScopedAccount {
            email: "work@example.com".into(),
            plan: plan.map(str::to_string),
            windows: vec![
                QuotaWindow { key: "five_hour".into(), used_percent: 61.0, resets_at: None },
                QuotaWindow { key: "seven_day".into(), used_percent: 24.0, resets_at: None },
            ],
            fetched_ms,
            problem,
        }
    }

    fn summary_of(quotas: &[AccountQuota]) -> Vec<(&str, QuotaSource, Option<QuotaProblem>, usize)> {
        quotas.iter().map(|q| (q.label.as_str(), q.source, q.problem, q.windows.len())).collect()
    }

    #[test]
    fn tokenscope_covers_matching_logins_and_the_rest_asks_itself() {
        let fetched_ms = now_ms();
        let scope = || Ok(vec![scoped_work(Some("max"), fetched_ms, Some(QuotaProblem::Stale))]);
        let quotas = QuotaCache::default().current_with(&profiles_without_credentials(), false, scope);
        assert_eq!(
            summary_of(&quotas),
            vec![
                ("work", QuotaSource::TokenScope, Some(QuotaProblem::Stale), 2),
                ("other", QuotaSource::Anthropic, Some(QuotaProblem::NoLogin), 0),
                ("bare", QuotaSource::Anthropic, Some(QuotaProblem::NoLogin), 0),
            ]
        );
        assert_eq!((quotas[0].plan.as_deref(), quotas[0].fetched_ms), (Some("max"), fetched_ms));
    }

    #[test]
    fn old_numbers_or_a_broken_login_at_tokenscope_make_agentd_ask_itself() {
        let profiles = profiles_without_credentials();
        let old = || Ok(vec![scoped_work(None, now_ms() - 11 * MINUTE_MS, None)]);
        let expired = || Ok(vec![scoped_work(None, now_ms(), Some(QuotaProblem::Expired))]);
        for scope in [old, expired] {
            let work = &QuotaCache::default().current_with(&profiles, false, scope)[0];
            assert_eq!((work.source, work.problem), (QuotaSource::Anthropic, Some(QuotaProblem::NoLogin)));
        }
    }

    #[test]
    fn tokenscope_numbers_stand_through_an_outage_until_they_are_old() {
        let mut cache = QuotaCache::default();
        let profiles = profiles_without_credentials();
        cache.current_with(&profiles, false, || Ok(vec![scoped_work(None, now_ms(), None)]));
        cache.tokenscope = TokenScope::default();

        let during_outage = &cache.current_with(&profiles, true, tokenscope_down)[0];
        assert_eq!((during_outage.source, during_outage.problem), (QuotaSource::TokenScope, None));

        if let Some(entry) = cache.entries().get_mut(&profiles[0].dir) {
            entry.quota.fetched_ms -= 11 * MINUTE_MS;
        }
        let too_old = &cache.current_with(&profiles, false, tokenscope_down)[0];
        // Asked itself: no login here, the last TokenScope numbers stay as the stale ones.
        assert_eq!((too_old.source, too_old.problem, too_old.windows.len()), (QuotaSource::Anthropic, Some(QuotaProblem::NoLogin), 2));
    }

    #[test]
    fn tokenscope_keeps_a_rate_limit_cooldown_and_the_own_plan() {
        let home = std::env::temp_dir().join(format!("agentd-quota-cooldown-{}", std::process::id()));
        std::fs::create_dir_all(&home).unwrap();
        // Expired, so the plan label is not asked at Anthropic from a test.
        let credential = r#"{"claudeAiOauth":{"accessToken":"t","expiresAt":1,"subscriptionType":"pro"}}"#;
        std::fs::write(home.join(CREDENTIALS_FILE), credential).unwrap();
        let profiles = [Profile { label: "work".into(), dir: home.clone(), email: Some("work@example.com".into()) }];
        let cache = QuotaCache::default();
        let until = Instant::now() + RATE_LIMIT_COOLDOWN;
        let blocked = AccountQuota {
            profile: home.clone(),
            label: "work".into(),
            email: None,
            plan: None,
            windows: Vec::new(),
            fetched_ms: 0,
            problem: Some(QuotaProblem::RateLimited),
            source: QuotaSource::Anthropic,
        };
        cache.entries().insert(home.clone(), Entry { asked: Some(Instant::now()), blocked_until: Some(until), quota: blocked });

        let work = &cache.current_with(&profiles, false, || Ok(vec![scoped_work(None, now_ms(), None)]))[0];
        assert_eq!((work.source, work.plan.as_deref()), (QuotaSource::TokenScope, Some("pro")));
        assert_eq!(cache.entries().get(&home).and_then(|e| e.blocked_until), Some(until));
    }

    #[test]
    fn changed_format_is_a_bad_answer() {
        assert_eq!(windows_of(r#"{"five_hour":{"utilization":1}}"#).err(), Some(QuotaProblem::BadAnswer));
    }
}

//! Plan quota from NEXRON TokenScope, while it runs on this machine.
//!
//! Bull, the Agent Dashboard and TokenScope all asked `oauth/usage` for the same logins, and
//! Anthropic answered 429 more often than not. For the transition until Bull is the only tool,
//! agentd reads TokenScope's snapshot (`GET /api/usage` on localhost) instead of asking Anthropic
//! itself. That snapshot is what TokenScope last fetched; asking it never reaches Anthropic.
//!
//! Plain HTTP/1.0 over a socket: no client crate and no process (so no console window), and a
//! 1.0 server never answers chunked. TokenScope only listens on the loopback address.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpStream};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use chrono::DateTime;
use serde::Deserialize;

use crate::quota::{has_main_windows, QuotaProblem, QuotaWindow, SHOWN_WINDOWS};

const ADDRESS: SocketAddrV4 = SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8787);
const USAGE_PATH: &str = "/api/usage";
/// For connecting and the whole answer together. Windows retries a refused connect on localhost
/// for about 2 s, so a check with TokenScope down always takes this long.
const DEADLINE: Duration = Duration::from_millis(1500);
/// The snapshot is a few kilobytes; anything far larger is not TokenScope.
const MAX_ANSWER_BYTES: usize = 1024 * 1024;
const READ_CHUNK_BYTES: usize = 16 * 1024;
/// A burst of requests (several views, a forced refresh) reads one answer.
const REUSE_ANSWER: Duration = Duration::from_secs(15);
/// TokenScope down is not asked again before this, so a machine without it does not pay the
/// deadline on every request.
const DOWN_PAUSE: Duration = Duration::from_secs(60);
const PROVIDER_CLAUDE: &str = "claude";
const STATUS_OK: &str = "ok";

#[derive(Debug, thiserror::Error)]
pub enum TokenScopeError {
    #[error("not reachable: {0}")]
    Unreachable(#[from] std::io::Error),
    #[error("no complete answer within {} ms", DEADLINE.as_millis())]
    TooSlow,
    #[error("answer larger than {MAX_ANSWER_BYTES} bytes")]
    TooLarge,
    #[error("answered HTTP {0}")]
    Status(u16),
    #[error("answer not readable, its format may have changed")]
    BadAnswer,
}

/// One Claude login as TokenScope last saw it, already in agentd's terms.
#[derive(Debug, Clone, PartialEq)]
pub struct ScopedAccount {
    pub email: String,
    /// Lower case like the CLI's `subscriptionType` (`max`, `pro`); TokenScope capitalizes it.
    pub plan: Option<String>,
    pub windows: Vec<QuotaWindow>,
    pub fetched_ms: u64,
    /// Why TokenScope's own last request failed while these numbers still stand
    pub problem: Option<QuotaProblem>,
}

/// TokenScope's last answer, how long it stands, and what was last written to stderr about it.
#[derive(Default)]
pub struct TokenScope {
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    next_check: Option<Instant>,
    accounts: Vec<ScopedAccount>,
    reported: Option<String>,
}

impl TokenScope {
    /// The logins TokenScope has numbers for; empty while it is down, which is the normal case on
    /// a remote machine and after the transition. `fetch` asks it (tests pass a fixture); it runs
    /// without a lock held, two callers at once may both ask.
    pub fn accounts(&self, fetch: impl FnOnce() -> Result<Vec<ScopedAccount>, TokenScopeError>) -> Vec<ScopedAccount> {
        let now = Instant::now();
        {
            let state = self.state();
            if state.next_check.is_some_and(|next| now < next) {
                return state.accounts.clone();
            }
        }
        let outcome = fetch();
        let mut state = self.state();
        let (accounts, pause, report) = match outcome {
            Ok(accounts) => (accounts, REUSE_ANSWER, "agentd: quota from TokenScope".to_string()),
            Err(err) => (Vec::new(), DOWN_PAUSE, format!("agentd: TokenScope not used, quota from Anthropic: {err}")),
        };
        // Once per change, so a TokenScope that stops answering or changes its format shows up.
        if state.reported.as_ref() != Some(&report) {
            eprintln!("{report}");
            state.reported = Some(report);
        }
        state.next_check = Some(now + pause);
        state.accounts = accounts.clone();
        accounts
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[derive(Deserialize)]
struct Snapshot {
    providers: Vec<Provider>,
}

#[derive(Deserialize)]
struct Provider {
    id: String,
    account: Option<Account>,
    plan: Option<String>,
    #[serde(default)]
    windows: Vec<Window>,
    status: String,
    fetched_at: String,
    #[serde(default)]
    stale: bool,
    warning_status: Option<String>,
}

#[derive(Deserialize)]
struct Account {
    email: Option<String>,
}

#[derive(Deserialize)]
struct Window {
    key: String,
    used_percent: f64,
    resets_at: Option<String>,
}

/// Every Claude login TokenScope has numbers for. Blocks for at most `DEADLINE`.
pub fn fetch() -> Result<Vec<ScopedAccount>, TokenScopeError> {
    let deadline = Instant::now() + DEADLINE;
    let mut stream = TcpStream::connect_timeout(&SocketAddr::V4(ADDRESS), DEADLINE)?;
    stream.set_write_timeout(Some(time_left(deadline)?))?;
    let request = format!("GET {USAGE_PATH} HTTP/1.0\r\nHost: {ADDRESS}\r\nAccept: application/json\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes())?;
    let mut raw = Vec::new();
    let mut chunk = [0u8; READ_CHUNK_BYTES];
    loop {
        // The socket timeout counts per read; the deadline bounds a server that trickles.
        stream.set_read_timeout(Some(time_left(deadline)?))?;
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        raw.extend_from_slice(&chunk[..read]);
        if raw.len() > MAX_ANSWER_BYTES {
            return Err(TokenScopeError::TooLarge);
        }
    }
    accounts_of(body_of(&raw)?)
}

fn time_left(deadline: Instant) -> Result<Duration, TokenScopeError> {
    deadline.checked_duration_since(Instant::now()).filter(|left| !left.is_zero()).ok_or(TokenScopeError::TooSlow)
}

fn body_of(raw: &[u8]) -> Result<&str, TokenScopeError> {
    let text = std::str::from_utf8(raw).map_err(|_| TokenScopeError::BadAnswer)?;
    let (head, body) = text.split_once("\r\n\r\n").ok_or(TokenScopeError::BadAnswer)?;
    let status = head.split(' ').nth(1).and_then(|code| code.parse::<u16>().ok()).ok_or(TokenScopeError::BadAnswer)?;
    if status != 200 {
        return Err(TokenScopeError::Status(status));
    }
    Ok(body)
}

/// A login without both main windows is left out, so its profiles ask Anthropic themselves.
fn accounts_of(body: &str) -> Result<Vec<ScopedAccount>, TokenScopeError> {
    let snapshot: Snapshot = serde_json::from_str(body).map_err(|_| TokenScopeError::BadAnswer)?;
    Ok(snapshot.providers.into_iter().filter(|provider| provider.id == PROVIDER_CLAUDE).filter_map(account_of).collect())
}

fn account_of(provider: Provider) -> Option<ScopedAccount> {
    let email = provider.account?.email?;
    let windows: Vec<QuotaWindow> = SHOWN_WINDOWS
        .iter()
        .filter_map(|key| {
            let window = provider.windows.iter().find(|window| window.key == *key)?;
            Some(QuotaWindow {
                key: (*key).to_string(),
                used_percent: window.used_percent,
                resets_at: window.resets_at.clone(),
            })
        })
        .collect();
    if !has_main_windows(&windows) {
        return None;
    }
    let fetched_ms = DateTime::parse_from_rfc3339(&provider.fetched_at).ok()?.timestamp_millis();
    Some(ScopedAccount {
        email,
        plan: provider.plan.map(|plan| plan.to_lowercase()),
        windows,
        fetched_ms: u64::try_from(fetched_ms).ok()?,
        problem: problem_of(&provider.status, provider.stale, provider.warning_status.as_deref()),
    })
}

/// TokenScope's `ProviderStatus` in agentd's terms. Old numbers without a reason are `Stale`, so
/// the app still says how old they are.
fn problem_of(status: &str, is_stale: bool, warning: Option<&str>) -> Option<QuotaProblem> {
    let failed = match (status, is_stale) {
        (STATUS_OK, false) => return None,
        (STATUS_OK, true) => warning,
        (status, _) => Some(status),
    };
    Some(match failed {
        None => QuotaProblem::Stale,
        Some("rate_limited") => QuotaProblem::RateLimited,
        Some("auth_expired" | "unauthorized") => QuotaProblem::Expired,
        Some("auth_missing") => QuotaProblem::NoLogin,
        Some("unreachable") => QuotaProblem::Unreachable,
        Some(_) => QuotaProblem::BadAnswer,
    })
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/tokenscope-usage.json");

    #[test]
    fn maps_claude_logins_and_skips_codex_and_logins_without_numbers() {
        let accounts = accounts_of(FIXTURE).unwrap();
        let emails: Vec<_> = accounts.iter().map(|a| a.email.as_str()).collect();
        assert_eq!(emails, vec!["work@example.com", "private@example.com"]);

        let work = &accounts[0];
        let windows: Vec<_> = work.windows.iter().map(|w| (w.key.as_str(), w.used_percent)).collect();
        assert_eq!(windows, vec![("five_hour", 61.0), ("seven_day", 24.0), ("seven_day_opus", 3.5)]);
        assert_eq!(work.windows[0].resets_at.as_deref(), Some("2026-11-16T01:29:59.851507Z"));
        assert_eq!((work.plan.as_deref(), work.fetched_ms, work.problem), (Some("max"), 1_794_788_084_923, None));
    }

    #[test]
    fn stale_numbers_carry_the_reason_tokenscope_could_not_refresh() {
        let accounts = accounts_of(FIXTURE).unwrap();
        assert_eq!((accounts[1].plan.as_deref(), accounts[1].problem), (Some("pro"), Some(QuotaProblem::RateLimited)));
        assert_eq!(problem_of("ok", true, None), Some(QuotaProblem::Stale));
        assert_eq!(problem_of("auth_expired", false, None), Some(QuotaProblem::Expired));
    }

    #[test]
    fn a_login_needs_both_main_windows() {
        let body = FIXTURE.replace(r#""key": "seven_day","#, r#""key": "seven_day_sonnet","#);
        let emails: Vec<_> = accounts_of(&body).unwrap().into_iter().map(|a| a.email).collect();
        assert_eq!(emails, Vec::<String>::new());
    }

    #[test]
    fn reads_the_body_of_an_ok_answer_only() {
        let ok = b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"providers\":[]}";
        assert_eq!(body_of(ok).unwrap(), "{\"providers\":[]}");
        assert!(matches!(body_of(b"HTTP/1.1 503 Service Unavailable\r\n\r\n"), Err(TokenScopeError::Status(503))));
        assert!(matches!(body_of(b"garbage"), Err(TokenScopeError::BadAnswer)));
        assert!(matches!(accounts_of("<html>"), Err(TokenScopeError::BadAnswer)));
    }

    #[test]
    fn down_is_not_asked_again_for_a_while() {
        let scope = TokenScope::default();
        let asked = Cell::new(0);
        let down = || {
            asked.set(asked.get() + 1);
            Err(TokenScopeError::Status(503))
        };
        assert_eq!(scope.accounts(down), Vec::new());
        assert_eq!(scope.accounts(down), Vec::new());
        assert_eq!(asked.get(), 1);
    }
}

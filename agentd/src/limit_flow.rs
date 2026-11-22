//! The limit behaviour of the daemon: notices a full account in Claude's stream, moves the
//! session to another account or parks it, and sends the waiting messages once the window resets.

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{Arc, MutexGuard, Weak};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use crate::catalog::{self, Profile};
use crate::daemon::{Daemon, DaemonError, Session};
use crate::limits::{self, RateInfo};
use crate::paths::{find_transcript, home, profile_dir};
use crate::protocol::{AccountRef, AfterMove, Event, LimitMode, LimitPolicy, LimitState, StartParams, WaitReason};
use crate::quota::AccountQuota;
use crate::transfer;

/// Said to Claude after a move or a reset, so the turn the limit cut off goes on. German, like
/// the chats it lands in. It names both cases: a bare "go on" after a turn that never started
/// left Claude looking for work it had not begun (seen 18.11.2026).
const CONTINUE_PROMPT: &str =
    "Das Limit hat deine Antwort auf meine letzte Nachricht unterbrochen. Mach dort weiter, oder fang sie jetzt an, falls du noch nicht begonnen hattest.";
/// Resumes one waiting chat per tick, so chats waiting for the same reset do not all hit the
/// fresh window at once.
const TICK: Duration = Duration::from_secs(10);
/// Claude names the reset to the minute; a minute later the window is surely open again.
const RESET_SLACK_MS: u64 = 60_000;
/// Neither Claude nor the quota named a reset: try again after this.
const UNKNOWN_RESET_RETRY_MS: u64 = 30 * 60_000;
const STOP_TIMEOUT: Duration = Duration::from_secs(30);
const STOP_POLL: Duration = Duration::from_millis(100);

/// A message sent to a waiting chat, kept whole (with its images) until the reset.
pub(crate) struct Queued {
    pub(crate) id: u64,
    pub(crate) content: Vec<Value>,
}

/// What a finished turn means for the limit handling.
enum TurnEnd {
    /// It went through: maybe the move card is done, maybe the next waiting message goes out.
    Done { is_move_settled: bool, next: Option<Vec<Value>> },
    /// The account is full; handle it with these start params and Claude's last rate info.
    Limit(StartParams, Option<RateInfo>),
    /// A further failure of a limit already being handled.
    Ignored,
}

/// What follows a move.
enum After {
    Continue { from: AccountRef },
    Wait { window: Option<String> },
    Ready,
}

impl<W: Write + Send + 'static> Daemon<W> {
    pub(crate) fn start_limit_clock(self: &Arc<Self>) {
        let daemon = Arc::downgrade(self);
        thread::spawn(move || tick_while_alive(&daemon));
    }

    pub(crate) fn set_limits(&self, id: Option<u64>, policy: LimitPolicy) -> Result<(), DaemonError> {
        let home = home().ok_or(DaemonError::NoHome)?;
        limits::save_policy(&home, &policy)?;
        *self.policy() = policy;
        self.emit(&Event::LimitsSet { id });
        Ok(())
    }

    /// Reads what one stdout line of Claude says about the account's limit.
    pub(crate) fn observe_limits(self: &Arc<Self>, tab: &str, event: &Value) {
        if let Some(rate) = limits::rate_info_of(event) {
            let policy = self.policy().clone();
            if self.with_session(tab, |session| note_rate(session, &policy, rate)) == Some(true) {
                self.in_thread(tab, Self::warn);
            }
            return;
        }
        if event["type"] != "result" {
            return;
        }
        match self.with_session(tab, |session| turn_end(session, event)) {
            Some(TurnEnd::Done { is_move_settled, next }) => {
                if is_move_settled {
                    self.emit(&Event::Limit { tab: tab.into(), state: LimitState::None });
                }
                if let Some(content) = next {
                    if let Err(err) = self.send_prompt(tab, &content) {
                        self.emit(&Event::Error { id: None, tab: Some(tab.into()), message: err.to_string() });
                    }
                }
            }
            Some(TurnEnd::Limit(params, rate)) => self.in_thread(tab, move |daemon, tab| {
                let handled = daemon.on_limit(tab, &params, rate.as_ref());
                // A park or move that failed leaves the next limit to be handled again.
                if handled.is_err() {
                    daemon.with_session(tab, |session| session.is_handling_limit = false);
                }
                handled
            }),
            Some(TurnEnd::Ignored) | None => {}
        }
    }

    /// Runs a step that asks Anthropic or waits for Claude to stop off the stream's thread.
    fn in_thread(self: &Arc<Self>, tab: &str, step: impl FnOnce(&Arc<Self>, &str) -> Result<(), DaemonError> + Send + 'static) {
        let (daemon, tab) = (Arc::clone(self), tab.to_string());
        thread::spawn(move || {
            if let Err(err) = step(&daemon, &tab) {
                daemon.emit(&Event::Error { id: None, tab: Some(tab), message: err.to_string() });
            }
        });
    }

    /// The 5-hour window passed 90 %: offer the account the chat would move to.
    fn warn(self: &Arc<Self>, tab: &str) -> Result<(), DaemonError> {
        let params = self.with_session(tab, |session| session.params.clone()).ok_or_else(|| DaemonError::NoTab(tab.into()))?;
        let accounts = Accounts::fetch(self, false)?;
        let current_dir = profile_dir(params.profile.clone())?;
        let current = accounts.profile(&current_dir);
        let candidate = limits::candidates(&self.policy().clone(), &limits::project_of(&params.cwd), &current_dir, &accounts.profiles, &accounts.quotas, true)
            .into_iter()
            .next();
        // Without a place to go there is nothing to suggest; the limit will park the chat.
        let Some(candidate) = candidate else { return Ok(()) };
        let account = limits::account_ref(&current, accounts.quota(&current_dir), limits::FIVE_HOUR);
        self.emit(&Event::Limit { tab: tab.into(), state: LimitState::Warning { account, candidate: Some(candidate) } });
        Ok(())
    }

    fn on_limit(self: &Arc<Self>, tab: &str, params: &StartParams, rate: Option<&RateInfo>) -> Result<(), DaemonError> {
        let accounts = Accounts::fetch(self, true)?;
        let current_dir = profile_dir(params.profile.clone())?;
        let current = accounts.profile(&current_dir);
        let quota = accounts.quota(&current_dir);
        let window = limits::full_window(rate, quota);
        let account = limits::full_account(&current, quota, rate, window.as_deref());
        let policy = self.policy().clone();
        let project = limits::project_of(&params.cwd);
        let allowed = limits::candidates(&policy, &project, &current_dir, &accounts.profiles, &accounts.quotas, true);
        match (policy.mode, allowed.first()) {
            (LimitMode::Auto, Some(target)) => self.move_tab(tab, target.clone(), After::Continue { from: account }),
            (LimitMode::Ask, Some(_)) => self.park(tab, account, window, WaitReason::Ask, allowed),
            (LimitMode::Wait, _) => self.park(tab, account, window, WaitReason::Policy, allowed),
            (_, None) => {
                // Offered once against the folder's rule; the user decides.
                let anyway = limits::candidates(&policy, &project, &current_dir, &accounts.profiles, &accounts.quotas, false);
                self.park(tab, account, window, WaitReason::NoAccount, anyway)
            }
        }
    }

    fn park(&self, tab: &str, account: AccountRef, window: Option<String>, reason: WaitReason, candidates: Vec<AccountRef>) -> Result<(), DaemonError> {
        let resume_at = account.resets_at_ms.map_or_else(|| now_ms() + UNKNOWN_RESET_RETRY_MS, |at| at + RESET_SLACK_MS);
        let state = self
            .with_session(tab, |session| {
                session.is_handling_limit = false;
                session.is_draining = false;
                session.waiting_until = Some(resume_at);
                // Sent at the reset but refused again: they wait once more, first in line.
                let mut queue = std::mem::take(&mut session.in_flight);
                queue.append(&mut session.queue);
                session.queue = queue;
                session.limit = LimitState::Waiting { account, window, reason, candidates, queue: Vec::new() };
                refresh_queue(session);
                session.limit.clone()
            })
            .ok_or_else(|| DaemonError::NoTab(tab.into()))?;
        self.emit(&Event::Limit { tab: tab.into(), state });
        Ok(())
    }

    /// Keeps a message for a waiting chat instead of sending it; false when the chat is not waiting.
    /// While a limit is being handled the message waits too: the full Claude would refuse it.
    pub(crate) fn queue_if_waiting(&self, tab: &str, content: &[Value]) -> bool {
        if !self.policy().queue {
            return false;
        }
        let id = self.next_entry.fetch_add(1, Ordering::Relaxed);
        let state = self.with_session(tab, |session| {
            if session.waiting_until.is_none() && !session.is_handling_limit {
                return None;
            }
            session.queue.push(Queued { id, content: content.to_vec() });
            refresh_queue(session);
            Some(session.limit.clone())
        });
        let Some(Some(state)) = state else { return false };
        if matches!(state, LimitState::Waiting { .. }) {
            self.emit(&Event::Limit { tab: tab.into(), state });
        }
        true
    }

    pub(crate) fn queue_remove(&self, tab: &str, entry: u64) -> Result<(), DaemonError> {
        let state = self
            .with_session(tab, |session| {
                session.queue.retain(|queued| queued.id != entry);
                refresh_queue(session);
                session.limit.clone()
            })
            .ok_or_else(|| DaemonError::NoTab(tab.into()))?;
        self.emit(&Event::Limit { tab: tab.into(), state });
        Ok(())
    }

    /// Claude goes on where the limit stopped it; the waiting messages follow one per finished
    /// turn (`turn_end`). Only a waiting chat or one just moved goes on: a late "send now" or tick
    /// must not start an extra turn.
    pub(crate) fn resume(&self, tab: &str, is_after_move: bool) -> Result<(), DaemonError> {
        let was_waiting = self
            .with_session(tab, |session| {
                let was_waiting = matches!(session.limit, LimitState::Waiting { .. });
                if !was_waiting && !is_after_move {
                    return None;
                }
                session.waiting_until = None;
                session.is_draining = true;
                if was_waiting {
                    session.limit = LimitState::None;
                }
                Some(was_waiting)
            })
            .ok_or_else(|| DaemonError::NoTab(tab.into()))?;
        let Some(was_waiting) = was_waiting else { return Ok(()) };
        if was_waiting {
            self.emit(&Event::Limit { tab: tab.into(), state: LimitState::None });
        }
        self.send_prompt(tab, &[json!({ "type": "text", "text": CONTINUE_PROMPT })])
    }

    /// The user picked an account on a card: `then` says whether Claude goes on, waits or idles there.
    pub(crate) fn limit_move(self: &Arc<Self>, tab: &str, profile: PathBuf, then: AfterMove) {
        self.in_thread(tab, move |daemon, tab| daemon.limit_move_now(tab, &profile, then));
    }

    fn limit_move_now(self: &Arc<Self>, tab: &str, profile: &Path, then: AfterMove) -> Result<(), DaemonError> {
        let (params, waiting_on, is_handling) = self
            .with_session(tab, |session| {
                let waiting_on = match &session.limit {
                    LimitState::Waiting { account, .. } => Some(account.clone()),
                    _ => None,
                };
                (session.params.clone(), waiting_on, session.is_handling_limit || self.moving().contains(tab))
            })
            .ok_or_else(|| DaemonError::NoTab(tab.into()))?;
        // agentd is moving or parking this chat itself; a second move would race with it.
        if is_handling {
            return Ok(());
        }
        // A waiting chat has messages to send; moving it only to idle would strand them.
        let then = if then == AfterMove::Ready && waiting_on.is_some() { AfterMove::Continue } else { then };
        let accounts = Accounts::fetch(self, false)?;
        let target = accounts.profile(profile);
        let target_quota = accounts.quota(profile);
        let after = match then {
            AfterMove::Continue => {
                let current_dir = profile_dir(params.profile.clone())?;
                let current = accounts.profile(&current_dir);
                let from = waiting_on.unwrap_or_else(|| limits::account_ref(&current, accounts.quota(&current_dir), limits::FIVE_HOUR));
                After::Continue { from }
            }
            AfterMove::Wait => {
                let window = limits::full_window(None, target_quota);
                let full = limits::full_account(&target, target_quota, None, window.as_deref());
                return self.move_tab(tab, full, After::Wait { window });
            }
            AfterMove::Ready => After::Ready,
        };
        self.move_tab(tab, limits::account_ref(&target, target_quota, limits::FIVE_HOUR), after)
    }

    /// Stops Claude, copies the session into `target`'s profile and resumes it there. Waiting
    /// messages come along.
    fn move_tab(self: &Arc<Self>, tab: &str, target: AccountRef, after: After) -> Result<(), DaemonError> {
        let (params, session_id) = self
            .with_session(tab, |session| (session.params.clone(), session.session_id.clone()))
            .ok_or_else(|| DaemonError::NoTab(tab.into()))?;
        let from_dir = profile_dir(params.profile.clone())?;
        if from_dir != target.profile {
            self.restart_on(tab, &from_dir, &target.profile, StartParams { resume: Some(session_id.clone()), ..params }, &session_id)?;
        }
        // A restart starts a fresh session; without one the old Claude may hit a limit again.
        self.with_session(tab, |session| session.is_handling_limit = false);
        match after {
            After::Continue { from } => {
                let state = LimitState::Moved { from, to: target };
                self.with_session(tab, |session| session.limit = state.clone());
                self.emit(&Event::Limit { tab: tab.into(), state });
                self.resume(tab, true)
            }
            After::Wait { window } => self.park(tab, target, window, WaitReason::Undone, Vec::new()),
            After::Ready => {
                self.with_session(tab, |session| {
                    session.waiting_until = None;
                    session.limit = LimitState::None;
                });
                self.emit(&Event::Limit { tab: tab.into(), state: LimitState::None });
                Ok(())
            }
        }
    }

    /// Claude of `tab` again, from `to`'s profile; the waiting messages survive the restart (the
    /// old Claude's exit hands them over, with everything sent until then). A failed copy or start
    /// leaves the chat where it was.
    fn restart_on(self: &Arc<Self>, tab: &str, from: &Path, to: &Path, resumed: StartParams, session_id: &str) -> Result<(), DaemonError> {
        self.moving().insert(tab.to_string());
        let stopped = self.stop(tab).and_then(|()| self.wait_until_stopped(tab));
        if let Err(err) = stopped {
            self.moving().remove(tab);
            return Err(err);
        }
        let queue = self.carried().remove(tab).unwrap_or_default();
        // Claude writes the transcript with the first message, so it is looked for only once Claude
        // has stopped; a new chat still without one has nothing to copy.
        let has_nothing_to_copy = resumed.is_fresh && find_transcript(Some(from.to_path_buf()), session_id)?.is_none();
        let copied = if has_nothing_to_copy { Ok(()) } else { transfer::copy_session(from, to, session_id) };
        let moved = copied
            .map_err(DaemonError::from)
            .and_then(|()| self.start(None, StartParams { profile: Some(to.to_path_buf()), ..resumed.clone() }));
        if let Err(err) = moved {
            self.start(None, resumed)?;
            self.with_session(tab, |session| session.queue = queue);
            return Err(err);
        }
        self.with_session(tab, |session| session.queue = queue);
        Ok(())
    }

    /// Waits for the old Claude's exit. One still busy after the timeout is ended: without stdin
    /// it could not take a message any more, so leaving it would strand the chat.
    fn wait_until_stopped(&self, tab: &str) -> Result<(), DaemonError> {
        let started = Instant::now();
        let mut has_killed = false;
        while self.moving().contains(tab) {
            if started.elapsed() > STOP_TIMEOUT && !has_killed {
                has_killed = true;
                if let Some(Err(err)) = self.with_session(tab, |session| session.child.kill()) {
                    eprintln!("agentd: could not end Claude of tab {tab} for a move: {err}");
                }
            }
            if started.elapsed() > STOP_TIMEOUT * 2 {
                self.moving().remove(tab);
                return Err(DaemonError::NotStopped(tab.into()));
            }
            thread::sleep(STOP_POLL);
        }
        Ok(())
    }

    /// The old Claude of a moving tab exited: its waiting messages go to the new one.
    pub(crate) fn carry_queue(&self, tab: &str, session: &mut Session) {
        if !self.moving().contains(tab) {
            return;
        }
        let mut queue = std::mem::take(&mut session.in_flight);
        queue.append(&mut session.queue);
        self.carried().insert(tab.to_string(), queue);
    }

    fn carried(&self) -> MutexGuard<'_, HashMap<String, Vec<Queued>>> {
        self.carried.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn resume_one_due(&self) {
        let now = now_ms();
        let due = self
            .sessions()
            .iter()
            .filter_map(|(tab, session)| session.waiting_until.filter(|at| *at <= now).map(|at| (at, tab.clone())))
            .min();
        let Some((_, tab)) = due else { return };
        if let Err(err) = self.resume(&tab, false) {
            self.emit(&Event::Error { id: None, tab: Some(tab), message: err.to_string() });
        }
    }

    /// The profile and label a tab runs under, for the app to show after a move it missed.
    pub(crate) fn account_of(profile: Option<PathBuf>) -> (Option<PathBuf>, Option<String>) {
        let (Some(home), Ok(dir)) = (home(), profile_dir(profile.clone())) else { return (profile, None) };
        let label = catalog::profiles(&home).into_iter().find(|known| known.dir == dir).map(|known| known.label);
        (Some(dir), label)
    }
}

/// What a `result` line means. A turn that went through settles the move card and, while the
/// queue drains, hands the next waiting message to Claude. One message per turn, because Claude
/// merges messages sent together into one turn, and then nobody can tell which got through.
fn turn_end(session: &mut Session, event: &Value) -> TurnEnd {
    let is_limit = limits::is_failed_result(event)
        && (session.rate.as_ref().is_some_and(|rate| rate.is_rejected) || limits::says_limit(event));
    if is_limit {
        if session.is_handling_limit || session.waiting_until.is_some() {
            return TurnEnd::Ignored;
        }
        session.is_handling_limit = true;
        return TurnEnd::Limit(session.params.clone(), session.rate.take());
    }
    session.in_flight.clear();
    let is_move_settled = matches!(session.limit, LimitState::Moved { .. });
    if is_move_settled {
        session.limit = LimitState::None;
    }
    let next = if session.is_draining && !session.queue.is_empty() {
        let queued = session.queue.remove(0);
        let content = queued.content.clone();
        session.in_flight.push(queued);
        Some(content)
    } else {
        session.is_draining = false;
        None
    };
    TurnEnd::Done { is_move_settled, next }
}

/// Remembers Claude's numbers and says whether to warn: once per 5-hour window, from 90 %.
fn note_rate(session: &mut Session, policy: &LimitPolicy, rate: RateInfo) -> bool {
    let is_high = rate.five_hour_percent.is_some_and(|percent| percent >= limits::SUGGEST_FROM_PERCENT);
    // An unknown reset counts as one window of its own.
    let window = rate.five_hour_resets_ms.unwrap_or_default();
    let should_warn = policy.suggest_early
        && policy.mode != LimitMode::Wait
        && !rate.is_rejected
        && is_high
        && session.waiting_until.is_none()
        && session.warned_for != Some(window);
    if should_warn {
        session.warned_for = Some(window);
    }
    session.rate = Some(rate);
    should_warn
}

fn refresh_queue(session: &mut Session) {
    if let LimitState::Waiting { queue, .. } = &mut session.limit {
        *queue = session.queue.iter().map(|queued| limits::queued_prompt(queued.id, &queued.content)).collect();
    }
}

fn tick_while_alive<W: Write + Send + 'static>(daemon: &Weak<Daemon<W>>) {
    loop {
        thread::sleep(TICK);
        let Some(daemon) = daemon.upgrade() else { return };
        daemon.resume_one_due();
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| u64::try_from(since.as_millis()).unwrap_or(u64::MAX))
}

/// The profiles of this machine and their quota, fetched once per decision.
struct Accounts {
    profiles: Vec<Profile>,
    quotas: Vec<AccountQuota>,
}

impl Accounts {
    fn fetch<W: Write + Send + 'static>(daemon: &Daemon<W>, force: bool) -> Result<Self, DaemonError> {
        let home = home().ok_or(DaemonError::NoHome)?;
        let profiles = catalog::profiles(&home);
        let quotas = daemon.quota.current(&profiles, force);
        Ok(Self { profiles, quotas })
    }

    /// A profile that left the catalog (deleted meanwhile) still has a folder and a name.
    fn profile(&self, dir: &Path) -> Profile {
        self.profiles.iter().find(|profile| profile.dir == dir).cloned().unwrap_or_else(|| Profile {
            label: dir.file_name().map(|name| name.to_string_lossy().strip_prefix(".claude-").unwrap_or("default").to_string()).unwrap_or_default(),
            dir: dir.to_path_buf(),
            email: None,
        })
    }

    fn quota(&self, dir: &Path) -> Option<&AccountQuota> {
        self.quotas.iter().find(|quota| quota.profile == dir)
    }
}

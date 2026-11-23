//! Owns the Claude processes, one per tab, and turns requests into stdin
//! writes and stdout lines into events.

use std::collections::{HashMap, HashSet};
use std::io::{self, BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

use crate::catalog;
use crate::chat;
use crate::claude;
use crate::commands::{self, SlashCommand};
use crate::files;
use crate::shell;
use crate::git;
use crate::limit_flow::Queued;
use crate::limits::{self, RateInfo};
use crate::live;
use crate::quota::QuotaCache;
use crate::usage::UsageIndex;
use crate::paths::{find_transcript, home, profile_dir};
use crate::profile_defaults;
use crate::session_settings::PendingChange;
use crate::profile_setup;
use crate::removal;
use crate::rewind;
use crate::subagents;
use crate::transfer;
use crate::protocol::{Envelope, Event, HistoryParams, LimitPolicy, LimitState, Request, StartParams, TabInfo};

/// What Claude reads as the answer to the approval `/clear` cut short.
const CLEAR_DENIAL: &str = "The user cleared the chat instead.";
/// Claude answers the control requests the app sends (context usage, rewinding) within a second;
/// past this it is stuck, and the app must hear so instead of waiting forever.
const CONTROL_WAIT: Duration = Duration::from_secs(60);

#[derive(Debug, thiserror::Error)]
pub enum DaemonError {
    #[error("no running tab {0}")]
    NoTab(String),
    #[error("session {0} is still running; stop it first")]
    SessionRunning(String),
    #[error("transcript of session {0} not found")]
    NoTranscript(String),
    #[error("tab {tab} now runs another session than {expected}; nothing cleared")]
    SessionChanged { tab: String, expected: String },
    #[error("home folder unknown")]
    NoHome,
    #[error("Claude in tab {0} did not stop")]
    NotStopped(String),
    #[error(transparent)]
    Claude(#[from] claude::ClaudeError),
    #[error(transparent)]
    Removal(#[from] removal::RemovalError),
    #[error(transparent)]
    ProfileSetup(#[from] profile_setup::ProfileSetupError),
    #[error(transparent)]
    Io(#[from] io::Error),
}

pub(crate) struct Session {
    pub(crate) child: Child,
    stdin: Option<ChildStdin>,
    pub(crate) session_id: String,
    /// Between a sent message and its result; told to an app that attaches later.
    is_working: bool,
    /// Unanswered `can_use_tool` requests, sent again to an app that attaches later.
    asks: Vec<Value>,
    /// The session a sent `/clear` replaces, until Claude reports the new one in `system`/`init`.
    clearing: Option<String>,
    /// How Claude was started, to start it again on another account.
    pub(crate) params: StartParams,
    /// Claude's last word on the account's limit.
    pub(crate) rate: Option<RateInfo>,
    /// The limit card, sent again to an app that attaches later.
    pub(crate) limit: LimitState,
    /// When a chat waiting for its reset goes on (ms since epoch).
    pub(crate) waiting_until: Option<u64>,
    /// Messages sent while it waits.
    pub(crate) queue: Vec<Queued>,
    /// The 5-hour window (its reset) the 90 % warning was sent for.
    pub(crate) warned_for: Option<u64>,
    /// A limit of this Claude is being dealt with (move or park on its way): the failures of the
    /// messages queued behind it in Claude are the same limit, not new ones.
    pub(crate) is_handling_limit: bool,
    /// After a reset or move the waiting messages go out one per turn; this is the one Claude has
    /// now. A new limit puts it back first in line instead of losing it.
    pub(crate) in_flight: Vec<Queued>,
    /// The queue is going out, one message per finished turn.
    pub(crate) is_draining: bool,
    /// What Claude listed last, sent again to an app that attaches later.
    commands: Option<Vec<SlashCommand>>,
    /// Mode, model or effort changes Claude has not answered yet.
    pub(crate) configuring: Vec<PendingChange>,
}

/// A control request the app sent through `control`, waiting for Claude's response.
struct PendingControl {
    tab: String,
    answer: mpsc::Sender<Value>,
}

pub struct Daemon<W: Write + Send + 'static> {
    sessions: Mutex<HashMap<String, Session>>,
    /// By request id; dropped with the tab's Claude, which tells the waiter it exited.
    controls: Mutex<HashMap<String, PendingControl>>,
    out: Mutex<W>,
    next_request: AtomicU64,
    pub(crate) next_entry: AtomicU64,
    pub(crate) quota: QuotaCache,
    usage: UsageIndex,
    policy: Mutex<LimitPolicy>,
    /// Tabs whose Claude is stopped to move it to another account, until it reported `exited`.
    pub(crate) moving: Mutex<HashSet<String>>,
    /// The waiting messages of a moving tab, from its old Claude's exit until the new one starts.
    pub(crate) carried: Mutex<HashMap<String, Vec<Queued>>>,
}

impl<W: Write + Send + 'static> Daemon<W> {
    pub fn new(out: W) -> Arc<Self> {
        let policy = home().map(|home| limits::load_policy(&home)).unwrap_or_default();
        let daemon = Arc::new(Self {
            sessions: Mutex::new(HashMap::new()),
            controls: Mutex::new(HashMap::new()),
            out: Mutex::new(out),
            next_request: AtomicU64::new(1),
            next_entry: AtomicU64::new(1),
            quota: QuotaCache::default(),
            usage: UsageIndex::default(),
            policy: Mutex::new(policy),
            moving: Mutex::new(HashSet::new()),
            carried: Mutex::new(HashMap::new()),
        });
        daemon.start_limit_clock();
        daemon
    }

    /// Reads requests until the input closes, then ends every session.
    pub fn serve(self: &Arc<Self>, input: impl BufRead) {
        for line in input.lines() {
            let Ok(line) = line else { break };
            self.request(&line);
        }
        let tabs: Vec<String> = self.sessions().keys().cloned().collect();
        for tab in tabs {
            // Already gone means it exited on its own; nothing left to close.
            let _ = self.stop(&tab);
        }
    }

    /// One request line; the app calls this directly, `serve` for each stdin line.
    pub fn request(self: &Arc<Self>, line: &str) {
        if line.trim().is_empty() {
            return;
        }
        match serde_json::from_str::<Envelope>(line) {
            Ok(envelope) => self.handle(envelope),
            Err(err) => {
                // An op this version does not know still answers its caller instead of leaving it waiting.
                let id = serde_json::from_str::<Value>(line).ok().and_then(|v| v["id"].as_u64());
                self.emit(&Event::Error { id, tab: None, message: format!("bad request: {err}") })
            }
        }
    }

    fn handle(self: &Arc<Self>, Envelope { id, request }: Envelope) {
        let tab = tab_of(&request);
        let outcome = match request {
            Request::Hello => {
                self.emit(&Event::Hello { id, version: env!("CARGO_PKG_VERSION"), os: std::env::consts::OS });
                Ok(())
            }
            Request::Start(params) => self.start(id, params),
            Request::Send { tab, content } if self.queue_if_waiting(&tab, &content) => Ok(()),
            Request::Send { tab, content } => self.send_prompt(&tab, &content),
            Request::Interrupt { tab } => self.control(&tab, json!({ "subtype": "interrupt" })),
            Request::Permission { tab, request_id, decision } => {
                self.with_session(&tab, |session| session.asks.retain(|ask| ask["request_id"] != request_id));
                let answered = self.write(&tab, &json!({
                    "type": "control_response",
                    "response": { "subtype": "success", "request_id": &request_id, "response": decision },
                }));
                // Every app drops its card, also the ones that did not decide.
                answered.map(|()| self.emit(&Event::PermissionResolved { tab, request_id }))
            }
            Request::Stop { tab } => self.stop(&tab),
            Request::Clear { tab, session_id } => self.clear(id, &tab, &session_id),
            Request::History(params) => self.history(id, params),
            Request::SubagentHistory { profile, session_id } => {
                // Every transcript of every subagent, again after each one finishes: not on this thread.
                self.answer_later(move || match subagent_history(profile, &session_id) {
                    Ok(agents) => Event::SubagentHistory { id, agents },
                    Err(err) => Event::Error { id, tab: None, message: err.to_string() },
                });
                Ok(())
            }
            Request::Profiles => {
                let home = home().ok_or(DaemonError::NoHome);
                home.map(|home| self.emit(&Event::Profiles { id, profiles: catalog::profiles(&home) }))
            }
            Request::Recent { limit } => home().ok_or(DaemonError::NoHome).map(|home| {
                let sessions = catalog::recent_sessions(&catalog::profiles(&home), limit);
                self.emit(&Event::Recent { id, sessions });
            }),
            Request::MoveSession { from, to, session_id, is_fresh } => self.move_session(id, from, to, session_id, is_fresh),
            Request::DeleteSession { profile, session_id } => self.delete_session(id, profile, session_id),
            Request::CreateProfile { name } => home().ok_or(DaemonError::NoHome).and_then(|home| {
                let profile = profile_setup::create_profile(&home, &name)?;
                self.emit(&Event::ProfileCreated { id, profile });
                Ok(())
            }),
            Request::Running => {
                let tabs = self.sessions().keys().cloned().collect();
                self.emit(&Event::Running { id, tabs });
                Ok(())
            }
            Request::Tabs => {
                let tabs = self.tab_infos();
                self.emit(&Event::Tabs { id, tabs });
                Ok(())
            }
            Request::Quota { force } => self.in_background(move |daemon, profiles| {
                Event::Quota { id, accounts: daemon.quota.current(&profiles, force) }
            }),
            Request::Usage { days } => self.in_background(move |daemon, profiles| {
                let report = daemon.usage.report(&profiles, days);
                Event::Usage { id, days, rows: report.rows, tools: report.tools, sessions: report.sessions }
            }),
            // A folder on a slow network drive must not hold up the requests behind it.
            Request::SetLimits { policy } => self.set_limits(id, policy),
            Request::LimitMove { tab, profile, then } => {
                self.limit_move(&tab, profile, then);
                Ok(())
            }
            Request::QueueRemove { tab, entry } => self.queue_remove(&tab, entry),
            Request::QueueSend { tab } => self.resume(&tab, false),
            Request::Branch { cwd } => {
                self.answer_later(move || Event::Branch { id, branch: git::branch_of(&cwd) });
                Ok(())
            }
            Request::ListFiles { cwd, limit } => {
                self.answer_later(move || {
                    let files::FileList { files, is_truncated } = files::list_files(&cwd, limit);
                    Event::Files { id, files, is_truncated }
                });
                Ok(())
            }
            // Runs up to the timeout; the requests behind it go on meanwhile.
            Request::RunShell { cwd, command } => {
                self.answer_later(move || match shell::run(&cwd, &command) {
                    Ok(run) => Event::ShellResult {
                        id,
                        stdout: run.stdout,
                        stderr: run.stderr,
                        code: run.code,
                        duration_ms: run.duration_ms,
                        is_timed_out: run.is_timed_out,
                    },
                    Err(err) => Event::Error { id, tab: None, message: err.to_string() },
                });
                Ok(())
            }
            Request::Control { tab, request } => self.control_for_app(id, tab, request),
            Request::RewindPoints { profile, session_id } => {
                self.answer_later(move || match rewind_points(profile, &session_id) {
                    Ok(points) => Event::RewindPoints { id, points },
                    Err(err) => Event::Error { id, tab: None, message: err.to_string() },
                });
                Ok(())
            }
            Request::Background { tab, tool_use_id } => {
                let mut request = json!({ "subtype": "background_tasks" });
                if let Some(tool_use_id) = tool_use_id {
                    request["tool_use_id"] = Value::String(tool_use_id);
                }
                self.control(&tab, request)
            }
            Request::Configure { tab, permission_mode, model, effort } => self.configure(id, &tab, permission_mode, model, effort),
            Request::ProfileDefaults { profile } => profile_dir(profile)
                .map(|dir| self.emit(&Event::ProfileDefaults { id, defaults: profile_defaults::read(&dir) })),
        };
        if let Err(err) = outcome {
            self.emit(&Event::Error { id, tab, message: err.to_string() });
        }
    }

    /// Answers on its own thread: Anthropic or a first scan of the transcripts can take seconds,
    /// and a remote client's requests (sending a message, stopping a tab) must not wait for it.
    fn in_background(
        self: &Arc<Self>,
        answer: impl FnOnce(&Self, Vec<catalog::Profile>) -> Event + Send + 'static,
    ) -> Result<(), DaemonError> {
        let home = home().ok_or(DaemonError::NoHome)?;
        let daemon = Arc::clone(self);
        self.answer_later(move || answer(&daemon, catalog::profiles(&home)));
        Ok(())
    }

    /// Computes the answer on its own thread and emits it from there.
    fn answer_later(self: &Arc<Self>, answer: impl FnOnce() -> Event + Send + 'static) {
        let daemon = Arc::clone(self);
        thread::spawn(move || daemon.emit(&answer()));
    }

    pub(crate) fn start(self: &Arc<Self>, id: Option<u64>, params: StartParams) -> Result<(), DaemonError> {
        // A reloaded window or a reconnected app asks again for a tab that never stopped: report
        // the running session with its state instead of failing, so its queued message goes through.
        let running = self
            .sessions()
            .get(&params.tab)
            .map(|session| {
                let working = session.is_working || session.clearing.is_some();
                (session.session_id.clone(), working, session.asks.clone(), session.params.profile.clone(), session.limit.clone(), session.commands.clone())
            });
        if let Some((session_id, working, asks, profile, limit, commands)) = running {
            let (profile, account) = Self::account_of(profile);
            self.emit(&Event::Started { id, tab: params.tab.clone(), session_id, working, profile, account });
            if let Some(commands) = commands {
                self.emit(&Event::Commands { tab: params.tab.clone(), commands });
            }
            // Marked, so the app can tell an approval it already knew from a new one.
            for mut event in asks {
                if let Some(fields) = event.as_object_mut() {
                    fields.insert("replay".into(), Value::Bool(true));
                }
                self.emit(&Event::Claude { tab: params.tab.clone(), event });
            }
            if limit != LimitState::None {
                self.emit(&Event::Limit { tab: params.tab.clone(), state: limit });
            }
            return self.catch_up(&params.tab, &params);
        }
        let (params, session_id) = session_to_start(params);
        let program = claude::find_claude()?;
        let generation = claude::generation_of(&program);
        let mut child = claude::command(&program, &params, &session_id, generation).spawn()?;
        let (stdout, stderr) = (child.stdout.take(), child.stderr.take());
        let tab = params.tab.clone();
        let (profile, account) = Self::account_of(params.profile.clone());
        let session = Session {
            stdin: child.stdin.take(),
            child,
            session_id: session_id.clone(),
            is_working: false,
            asks: Vec::new(),
            clearing: None,
            params,
            rate: None,
            limit: LimitState::None,
            waiting_until: None,
            queue: Vec::new(),
            warned_for: None,
            is_handling_limit: false,
            in_flight: Vec::new(),
            is_draining: false,
            commands: None,
            configuring: Vec::new(),
        };
        self.sessions().insert(tab.clone(), session);
        // Lists the commands and skills and makes Claude ready for control requests.
        self.control(&tab, json!({ "subtype": "initialize" }))?;
        self.emit(&Event::Started { id, tab: tab.clone(), session_id, working: false, profile, account });
        if let Some(stderr) = stderr {
            let daemon = Arc::clone(self);
            let tab = tab.clone();
            thread::spawn(move || {
                for text in BufReader::new(stderr).lines().map_while(Result::ok) {
                    daemon.emit(&Event::Stderr { tab: tab.clone(), text });
                }
            });
        }
        if let Some(stdout) = stdout {
            let daemon = Arc::clone(self);
            thread::spawn(move || daemon.pump(&tab, stdout));
        }
        Ok(())
    }

    fn pump(self: &Arc<Self>, tab: &str, stdout: impl io::Read) {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let event: Value = serde_json::from_str(&line).unwrap_or_else(|_| json!({ "type": "raw", "line": line }));
            if let Some(answer) = self.waiting_control(&event) {
                // A waiter that timed out has nobody left to tell.
                let _ = answer.send(event["response"].clone());
                continue;
            }
            self.with_session(tab, |session| track_turn(session, &event));
            self.observe_limits(tab, &event);
            if let Some(commands) = commands::commands_in(&event) {
                self.with_session(tab, |session| session.commands = Some(commands.clone()));
                self.emit(&Event::Commands { tab: tab.to_string(), commands });
            }
            self.settle_setting(tab, &event);
            // Messages arrive parsed, everything else (deltas, results, permission asks) raw.
            match chat::message_from(&event) {
                Some(message) => self.emit(&Event::Message { tab: tab.to_string(), message }),
                None => self.emit(&Event::Claude { tab: tab.to_string(), event }),
            }
        }
        // Taken out first so the wait below does not hold the lock for other tabs.
        let session = self.sessions().remove(tab);
        // After the session: a control request arriving now finds no tab instead of waiting on a
        // dead pipe. The senders go with them, so each waiter hears that Claude is gone.
        self.controls().retain(|_, pending| pending.tab != tab);
        let code = session
            .and_then(|mut session| {
                self.answer_unsettled(tab, std::mem::take(&mut session.configuring));
                self.carry_queue(tab, &mut session);
                session.child.wait().ok()
            })
            .and_then(|status| status.code());
        self.emit(&Event::Exited { tab: tab.to_string(), code });
        // Only now may a move start Claude again: the app must see this exit before the new start.
        self.moving().remove(tab);
    }

    fn tab_infos(&self) -> Vec<TabInfo> {
        let sessions: Vec<_> = self
            .sessions()
            .iter()
            .map(|(tab, session)| (tab.clone(), session.session_id.clone(), session.is_working || session.clearing.is_some(), session.asks.len(), session.params.clone()))
            .collect();
        // Outside the lock: naming the account and the session reads files.
        sessions
            .into_iter()
            .map(|(tab, session_id, working, asks, params)| {
                // The profile as the app started it (`None` for the default), as `start` takes it again.
                let (_, account) = Self::account_of(params.profile.clone());
                let title = find_transcript(params.profile.clone(), &session_id).ok().flatten().and_then(|path| catalog::title_of(&path));
                let StartParams { cwd, profile, model, permission_mode, effort, is_fresh, .. } = params;
                TabInfo { tab, session_id, title, cwd, profile, account, working, asks, model, permission_mode, effort, is_fresh }
            })
            .collect()
    }

    pub(crate) fn moving(&self) -> MutexGuard<'_, HashSet<String>> {
        self.moving.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn control(&self, tab: &str, request: Value) -> Result<(), DaemonError> {
        self.write_control(tab, &self.next_request_id(), request)
    }

    pub(crate) fn next_request_id(&self) -> String {
        format!("agentd-{}", self.next_request.fetch_add(1, Ordering::Relaxed))
    }

    pub(crate) fn write_control(&self, tab: &str, request_id: &str, request: Value) -> Result<(), DaemonError> {
        self.write(tab, &json!({ "type": "control_request", "request_id": request_id, "request": request }))
    }

    /// Sends the app's control request and answers with Claude's response on its own thread.
    fn control_for_app(self: &Arc<Self>, id: Option<u64>, tab: String, request: Value) -> Result<(), DaemonError> {
        let request_id = self.next_request_id();
        let subtype = request["subtype"].as_str().unwrap_or("control").to_string();
        let (answer, answered) = mpsc::channel();
        // Registered before writing: Claude may answer before `write` returns.
        self.controls().insert(request_id.clone(), PendingControl { tab: tab.clone(), answer });
        if let Err(err) = self.write_control(&tab, &request_id, request) {
            self.controls().remove(&request_id);
            return Err(err);
        }
        let daemon = Arc::clone(self);
        thread::spawn(move || {
            let event = match answered.recv_timeout(CONTROL_WAIT) {
                Ok(response) => control_event(id, tab, response),
                Err(RecvTimeoutError::Timeout) => {
                    daemon.controls().remove(&request_id);
                    Event::Error { id, tab: None, message: format!("Claude in tab {tab} did not answer {subtype} in time") }
                }
                Err(RecvTimeoutError::Disconnected) => {
                    let message = format!("Claude in tab {tab} exited before answering {subtype}");
                    Event::Error { id, tab: None, message }
                }
            };
            daemon.emit(&event);
        });
        Ok(())
    }

    /// The waiter of a control response the app asked for; other responses go to the app as they are.
    fn waiting_control(&self, event: &Value) -> Option<mpsc::Sender<Value>> {
        if event["type"] != "control_response" {
            return None;
        }
        let request_id = event["response"]["request_id"].as_str()?;
        self.controls().remove(request_id).map(|pending| pending.answer)
    }

    fn write(&self, tab: &str, message: &Value) -> Result<(), DaemonError> {
        let mut sessions = self.sessions();
        let stdin = sessions
            .get_mut(tab)
            .and_then(|session| session.stdin.as_mut())
            .ok_or_else(|| DaemonError::NoTab(tab.to_string()))?;
        writeln!(stdin, "{message}")?;
        stdin.flush()?;
        Ok(())
    }

    pub(crate) fn stop(&self, tab: &str) -> Result<(), DaemonError> {
        let mut sessions = self.sessions();
        let session = sessions.get_mut(tab).ok_or_else(|| DaemonError::NoTab(tab.to_string()))?;
        session.stdin = None;
        Ok(())
    }

    fn clear(&self, id: Option<u64>, tab: &str, session_id: &str) -> Result<(), DaemonError> {
        let (asks, is_working) = {
            let mut sessions = self.sessions();
            let session = sessions.get_mut(tab).ok_or_else(|| DaemonError::NoTab(tab.to_string()))?;
            // A tab restarted or switched account in between: its `/clear` would hit another chat.
            if session.session_id != session_id {
                return Err(DaemonError::SessionChanged { tab: tab.to_string(), expected: session_id.to_string() });
            }
            // Asked twice before Claude got to it: one `/clear` is on its way already.
            if session.clearing.is_some() {
                drop(sessions);
                self.emit(&Event::Cleared { id, tab: tab.to_string() });
                return Ok(());
            }
            session.clearing = Some(session_id.to_string());
            (std::mem::take(&mut session.asks), session.is_working)
        };
        // Claude holds a queued `/clear` until the turn ends, and an open ask never ends it.
        for ask in asks {
            self.write(tab, &json!({
                "type": "control_response",
                "response": { "subtype": "success", "request_id": ask["request_id"],
                    "response": { "behavior": "deny", "message": CLEAR_DENIAL, "interrupt": true } },
            }))?;
        }
        if is_working {
            self.control(tab, json!({ "subtype": "interrupt" }))?;
        }
        let sent = self.write(tab, &json!({ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": "/clear" }] } }));
        if sent.is_err() {
            self.with_session(tab, |session| session.clearing = None);
        }
        sent?;
        self.emit(&Event::Cleared { id, tab: tab.to_string() });
        Ok(())
    }

    fn delete_session(&self, id: Option<u64>, profile: Option<PathBuf>, session_id: String) -> Result<(), DaemonError> {
        let home = home().ok_or(DaemonError::NoHome)?;
        let dir = profile_dir(profile)?;
        // Deleting under a running Claude would leave it writing into a file nobody lists.
        let is_running_here = self.sessions().values().any(|session| session.session_id == session_id);
        if is_running_here || live::running_session_ids(&dir).contains(&session_id) {
            return Err(DaemonError::SessionRunning(session_id));
        }
        let known: Vec<PathBuf> = catalog::profiles(&home).into_iter().map(|profile| profile.dir).collect();
        removal::delete_session(&dir, &known, &session_id)?;
        self.emit(&Event::Deleted { id, session_id });
        Ok(())
    }

    fn history(&self, id: Option<u64>, params: HistoryParams) -> Result<(), DaemonError> {
        // A fresh session has no transcript until its first prompt; any other session without
        // one was moved or deleted, and the app says so.
        let messages = match find_transcript(params.profile, &params.session_id)? {
            Some(path) => chat::parse_transcript(&std::fs::read_to_string(path)?),
            None if params.is_fresh => Vec::new(),
            None => return Err(DaemonError::NoTranscript(params.session_id)),
        };
        let (messages, has_more) = chat::page(&messages, params.before.as_deref(), params.limit);
        self.emit(&Event::History { id, messages, has_more });
        Ok(())
    }

    fn move_session(
        &self,
        id: Option<u64>,
        from: Option<PathBuf>,
        to: Option<PathBuf>,
        session_id: String,
        is_fresh: bool,
    ) -> Result<(), DaemonError> {
        let (from, to) = (profile_dir(from)?, profile_dir(to)?);
        // Two processes on one transcript lose messages, so a running session stays where it is.
        let is_running_here = self.sessions().values().any(|session| session.session_id == session_id);
        if is_running_here || live::running_session_ids(&from).contains(&session_id) {
            return Err(DaemonError::SessionRunning(session_id));
        }
        // Claude writes the transcript with the first message; a new chat starts without one.
        let has_nothing_to_copy = is_fresh && find_transcript(Some(from.clone()), &session_id)?.is_none();
        if !has_nothing_to_copy {
            transfer::copy_session(&from, &to, &session_id)?;
        }
        self.emit(&Event::Moved { id, session_id });
        Ok(())
    }

    pub(crate) fn with_session<R>(&self, tab: &str, change: impl FnOnce(&mut Session) -> R) -> Option<R> {
        self.sessions().get_mut(tab).map(change)
    }

    /// One user message to Claude; the turn runs from here.
    pub(crate) fn send_prompt(&self, tab: &str, content: &[Value]) -> Result<(), DaemonError> {
        self.write(tab, &json!({ "type": "user", "message": { "role": "user", "content": content } }))?;
        self.with_session(tab, |session| session.is_working = true);
        Ok(())
    }

    pub(crate) fn policy(&self) -> MutexGuard<'_, LimitPolicy> {
        self.policy.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// No Claude left; a background server may exit once no app is connected either.
    pub fn is_idle(&self) -> bool {
        self.sessions().is_empty()
    }

    fn controls(&self) -> MutexGuard<'_, HashMap<String, PendingControl>> {
        self.controls.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn sessions(&self) -> MutexGuard<'_, HashMap<String, Session>> {
        // A panicked writer thread leaves the map intact; keep serving.
        self.sessions.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn emit(&self, event: &Event) {
        // Events are plain data; serialising them cannot fail.
        let Ok(line) = serde_json::to_string(event) else { return };
        let mut out = self.out.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        // If the dashboard is gone there is nobody left to tell.
        let _ = writeln!(out, "{line}").and_then(|()| out.flush());
    }
}

/// The session id Claude runs under, and whether it resumes it. A tab keeps its session id from
/// the start, but Claude writes the transcript only with the first message, and `claude --resume`
/// of such a session exits with "No conversation found"; a fresh one starts under the same id
/// instead. Any other session is resumed, so Claude reports a lost transcript itself.
fn session_to_start(params: StartParams) -> (StartParams, String) {
    let Some(id) = params.resume.clone() else {
        return (params, uuid::Uuid::new_v4().to_string());
    };
    if params.is_fresh && matches!(find_transcript(params.profile.clone(), &id), Ok(None)) {
        return (StartParams { resume: None, ..params }, id);
    }
    (params, id)
}

/// Claude Code answers `{subtype: success, response}` or `{subtype: error, error}`. A failure
/// answers only the request: an error event naming the tab means the tab failed, and the app then
/// takes back the prompts it sent there.
fn control_event(id: Option<u64>, tab: String, response: Value) -> Event {
    if response["subtype"] == "success" {
        return Event::ControlResult { id, tab, response: response["response"].clone() };
    }
    let message = response["error"].as_str().unwrap_or("Claude refused the control request").to_string();
    Event::Error { id, tab: None, message }
}

fn rewind_points(profile: Option<PathBuf>, session_id: &str) -> Result<Vec<rewind::RewindPoint>, DaemonError> {
    match find_transcript(profile, session_id)? {
        Some(path) => Ok(rewind::points(&std::fs::read_to_string(path)?)),
        None => Ok(Vec::new()),
    }
}

fn subagent_history(profile: Option<PathBuf>, session_id: &str) -> Result<Vec<subagents::SubagentTranscript>, DaemonError> {
    match find_transcript(profile, session_id)? {
        Some(path) => Ok(subagents::transcripts_beside(&path)?),
        None => Ok(Vec::new()),
    }
}

fn tab_of(request: &Request) -> Option<String> {
    match request {
        Request::Start(StartParams { tab, .. })
        | Request::Send { tab, .. }
        | Request::Interrupt { tab }
        | Request::Permission { tab, .. }
        | Request::Stop { tab }
        | Request::Clear { tab, .. }
        | Request::LimitMove { tab, .. }
        | Request::QueueRemove { tab, .. }
        | Request::QueueSend { tab }
        | Request::Background { tab, .. } => Some(tab.clone()),
        Request::Hello
        | Request::History(_)
        | Request::SubagentHistory { .. }
        | Request::Profiles
        | Request::Recent { .. }
        | Request::MoveSession { .. }
        | Request::DeleteSession { .. }
        | Request::CreateProfile { .. }
        | Request::Running
        | Request::Tabs
        | Request::Quota { .. }
        | Request::Usage { .. }
        | Request::Branch { .. }
        | Request::SetLimits { .. }
        | Request::ListFiles { .. }
        | Request::RunShell { .. }
        | Request::RewindPoints { .. }
        // A refused control request is no failure of the tab, see `control_event`.
        | Request::Control { .. }
        // Only the asker hears of a refused change; it is no notice of the chat.
        | Request::Configure { .. }
        | Request::ProfileDefaults { .. } => None,
    }
}

/// Keeps what an app attaching later needs: whether a turn runs and which asks are open.
fn track_turn(session: &mut Session, event: &Value) {
    // The mode Claude reports (`status` on every change, `init` per turn), also one it switched to
    // itself after a plan: a restart on another account starts Claude in it again.
    if event["type"] == "system" && event["parent_tool_use_id"].is_null() {
        if let Some(mode) = event["permissionMode"].as_str() {
            session.params.permission_mode = Some(mode.to_string());
        }
    }
    match event["type"].as_str() {
        // A finished or interrupted turn leaves no ask open.
        Some("result") => {
            session.is_working = false;
            session.asks.clear();
        }
        Some("control_request") if event["request"]["subtype"] == "can_use_tool" => session.asks.push(event.clone()),
        // `/clear` starts a new session in the same process; later checks and replays need its id.
        // A subagent's events carry its parent call and say nothing about the tab's session.
        Some("system") if event["subtype"] == "init" && event["parent_tool_use_id"].is_null() => {
            if let Some(id) = event["session_id"].as_str() {
                if session.clearing.as_deref().is_some_and(|old| old != id) {
                    session.clearing = None;
                }
                session.session_id = id.to_string();
            }
        }
        _ => {}
    }
}

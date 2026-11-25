//! An app attaching to a tab whose Claude still runs: a reloaded window, a restarted app or a
//! dropped connection. It gets the tab's state again, including the block Claude is streaming.

use std::io::Write;
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::Value;

use crate::commands::SlashCommand;
use crate::daemon::{Daemon, DaemonError};
use crate::partial_reply::PartialReply;
use crate::protocol::{Event, LimitState, StartParams};

/// What a running tab sends again to an app that attaches. Its pump holds the lock while it takes
/// in a line and emits it, so an attaching app gets this either before a line or after its emit,
/// never a line twice or not at all.
#[derive(Default)]
pub(crate) struct Replayable {
    pub(crate) partial: PartialReply,
    /// Unanswered `can_use_tool` requests
    pub(crate) asks: Vec<Value>,
    /// What Claude listed last
    pub(crate) commands: Option<Vec<SlashCommand>>,
    /// Claude's last `background_tasks_changed`: Claude sends it only on a change, and without it
    /// the app would show a chat whose shells or agents still run as finished.
    background_tasks: Option<Value>,
}

impl Replayable {
    /// A raw line of Claude's.
    pub(crate) fn track(&mut self, event: &Value) {
        self.partial.observe(event);
        match event["type"].as_str() {
            // A finished or interrupted turn leaves no ask open.
            Some("result") => self.asks.clear(),
            Some("control_request") if event["request"]["subtype"] == "can_use_tool" => self.asks.push(event.clone()),
            Some("system") if event["subtype"] == "background_tasks_changed" => self.background_tasks = Some(event.clone()),
            _ => {}
        }
    }
}

pub(crate) fn locked(replayable: &Mutex<Replayable>) -> MutexGuard<'_, Replayable> {
    replayable.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// How attaching to a tab's running Claude went.
enum Attach {
    Done,
    /// Another Claude runs in the tab now.
    Replaced,
    /// No Claude runs in the tab anymore; it starts anew.
    Ended,
}

impl<W: Write + Send + 'static> Daemon<W> {
    /// Reports the tab's running session with its state, so a queued message of the app goes
    /// through; `None` when no Claude runs there and it has to start.
    pub(crate) fn attach_running(self: &Arc<Self>, id: Option<u64>, params: &StartParams) -> Option<Result<(), DaemonError>> {
        loop {
            let replayable = self.replayable_of(&params.tab)?;
            match self.attach(id, params, &replayable) {
                Attach::Done => return Some(self.catch_up(&params.tab, params)),
                // Claude was replaced in between (a move): attach to the one running now.
                Attach::Replaced => {}
                Attach::Ended => return None,
            }
        }
    }

    pub(crate) fn replayable_of(&self, tab: &str) -> Option<Arc<Mutex<Replayable>>> {
        self.sessions().get(tab).map(|session| Arc::clone(&session.replayable))
    }

    /// Holds the tab's replay lock throughout, so the replay is ordered against the pump's lines.
    fn attach(&self, id: Option<u64>, params: &StartParams, gate: &Arc<Mutex<Replayable>>) -> Attach {
        let replayable = locked(gate);
        let (session_id, working, (profile, cwd), limit) = {
            let sessions = self.sessions();
            let Some(session) = sessions.get(&params.tab) else { return Attach::Ended };
            if !Arc::ptr_eq(gate, &session.replayable) {
                return Attach::Replaced;
            }
            let working = session.is_working || session.is_clearing();
            let place = (session.params.profile.clone(), session.params.cwd.clone());
            (session.session_id.clone(), working, place, session.limit.clone())
        };
        let tab = &params.tab;
        let (profile, account) = Self::account_of(profile);
        self.emit(&Event::Started { id, tab: tab.clone(), session_id: session_id.clone(), working, profile, account, cwd });
        if let Some(commands) = replayable.commands.clone() {
            self.emit(&Event::Commands { tab: tab.clone(), commands });
        }
        self.replay_title(tab, &session_id);
        // Before the asks: an open ask is what the app shows last.
        if let Some(event) = replayable.partial.replay(tab) {
            self.emit(&event);
        }
        self.replay_asks(tab, &replayable.asks);
        if let Some(event) = replayable.background_tasks.clone() {
            self.emit(&Event::Claude { tab: tab.clone(), event });
        }
        if limit != LimitState::None {
            self.emit(&Event::Limit { tab: tab.clone(), state: limit });
        }
        Attach::Done
    }

    /// Marked, so the app can tell an approval it already knew from a new one.
    fn replay_asks(&self, tab: &str, asks: &[Value]) {
        for ask in asks {
            let mut event = ask.clone();
            if let Some(fields) = event.as_object_mut() {
                fields.insert("replay".into(), Value::Bool(true));
            }
            self.emit(&Event::Claude { tab: tab.to_string(), event });
        }
    }

    /// An answered ask is no longer replayed.
    pub(crate) fn forget_ask(&self, tab: &str, request_id: &str) {
        if let Some(replayable) = self.replayable_of(tab) {
            locked(&replayable).asks.retain(|ask| ask["request_id"] != request_id);
        }
    }
}

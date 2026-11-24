//! Names a chat after each message the user sends (see `titles`): asks Haiku on its own thread,
//! keeps the answer by session id and tells the app.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::daemon::Daemon;
use crate::protocol::Event;
use crate::titles;

/// One message to name: the session it went to, its account and its text.
pub(crate) struct TitleRequest {
    session_id: String,
    profile: Option<PathBuf>,
    text: String,
}

impl<W: Write + Send + 'static> Daemon<W> {
    /// After a message reached the tab's Claude. At most one Haiku call runs per tab: messages
    /// sent meanwhile wait, and only the newest of them is named once the call is done. So quick
    /// messages cost one call more, not one each, and every title that arrives is the newest.
    pub(crate) fn retitle(self: &Arc<Self>, tab: &str, content: &[Value]) {
        let Some(text) = titles::request_text(content) else { return };
        // Mid `/clear` the session id is still the old chat's; its title must not change.
        let Some(Some((session_id, profile))) = self.with_session(tab, |session| {
            (!session.is_clearing()).then(|| (session.session_id.clone(), session.params.profile.clone()))
        }) else {
            return;
        };
        let request = TitleRequest { session_id, profile, text };
        {
            let mut waiting = self.title_waiting();
            if let Some(slot) = waiting.get_mut(tab) {
                *slot = Some(request);
                return;
            }
            waiting.insert(tab.to_string(), None);
        }
        let daemon = Arc::clone(self);
        let tab = tab.to_string();
        thread::spawn(move || {
            let mut request = request;
            loop {
                daemon.name(&tab, &request);
                let mut waiting = daemon.title_waiting();
                match waiting.get_mut(&tab).and_then(Option::take) {
                    Some(next) => request = next,
                    None => {
                        waiting.remove(&tab);
                        return;
                    }
                }
            }
        });
    }

    fn name(&self, tab: &str, request: &TitleRequest) {
        let previous = self.titles.get(&request.session_id);
        let Some(title) = titles::generate(request.profile.as_deref(), previous.as_deref(), &request.text) else { return };
        if previous.as_deref() == Some(title.as_str()) {
            return;
        }
        self.titles.set(&request.session_id, &title, now_ms());
        self.emit(&Event::Title { tab: tab.to_string(), session_id: request.session_id.clone(), title });
    }

    /// The title of a running tab, sent again to an app that attaches.
    pub(crate) fn replay_title(&self, tab: &str, session_id: &str) {
        if let Some(title) = self.titles.get(session_id) {
            self.emit(&Event::Title { tab: tab.to_string(), session_id: session_id.to_string(), title });
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| u64::try_from(since.as_millis()).unwrap_or(u64::MAX))
}

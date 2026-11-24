//! Names a chat after each message the user sends (see `titles`): asks Haiku on its own thread,
//! keeps the answer by session id and tells the app.

use std::io::Write;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::daemon::Daemon;
use crate::protocol::Event;
use crate::titles;

impl<W: Write + Send + 'static> Daemon<W> {
    /// After a message to the tab's Claude. Two quick messages race; only the newer one's title
    /// counts, so an answer that arrives late never overwrites a fresher one.
    pub(crate) fn retitle(self: &Arc<Self>, tab: &str, content: &[Value]) {
        let Some(request) = titles::request_text(content) else { return };
        let Some((session_id, profile)) =
            self.with_session(tab, |session| (session.session_id.clone(), session.params.profile.clone()))
        else {
            return;
        };
        let call = self.next_title_call.fetch_add(1, Ordering::Relaxed);
        self.title_calls().insert(tab.to_string(), call);
        let daemon = Arc::clone(self);
        let tab = tab.to_string();
        thread::spawn(move || {
            let previous = daemon.titles.get(&session_id);
            let Some(title) = titles::generate(profile.as_deref(), previous.as_deref(), &request) else { return };
            if daemon.title_calls().get(&tab) != Some(&call) || previous.as_deref() == Some(title.as_str()) {
                return;
            }
            daemon.titles.set(&session_id, &title, now_ms());
            daemon.emit(&Event::Title { tab, session_id, title });
        });
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

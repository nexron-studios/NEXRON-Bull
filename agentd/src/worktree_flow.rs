//! A chat's own worktree (see `worktree`) on the daemon: made by `start` before its Claude runs,
//! merged into `preview` and removed on request. Each takes a fetch or a merge, so on its own thread.

use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::thread;

use crate::daemon::{Daemon, DaemonError};
use crate::protocol::{Event, StartParams, WorktreePlan};
use crate::worktree::{self, WorktreeError};

impl<W: Write + Send + 'static> Daemon<W> {
    /// Makes the worktree, then starts Claude in it. One creation per tab: a second start meanwhile
    /// (an app that reconnected, or a new message after a stop) waits for this one's `started`, and
    /// takes back a stop that came before it. A stop that stays takes the fresh worktree away
    /// again, since nothing was done in it yet, and ends with `exited` either way.
    pub(crate) fn start_in_worktree(self: &Arc<Self>, id: Option<u64>, params: StartParams, plan: WorktreePlan) -> Result<(), DaemonError> {
        {
            let mut creating = self.creating_worktrees();
            if let Some(is_stopped) = creating.get_mut(&params.tab) {
                *is_stopped = false;
                return Ok(());
            }
            creating.insert(params.tab.clone(), false);
        }
        let daemon = Arc::clone(self);
        thread::spawn(move || {
            let made = worktree::create(&params.cwd, &plan.hint, plan.root.as_deref(), &params.tab);
            let is_stopped = daemon.creating_worktrees().remove(&params.tab).unwrap_or(true);
            let tab = params.tab.clone();
            match made {
                Err(err) => {
                    daemon.emit(&refusal(id, Some(tab.clone()), &err));
                    // A stop waits for the end of the tab's Claude; there is none to wait for.
                    if is_stopped {
                        daemon.emit(&Event::Exited { tab, code: None });
                    }
                }
                Ok(folder) if is_stopped => {
                    daemon.drop_worktree(&folder);
                    daemon.emit(&Event::Exited { tab, code: None });
                }
                Ok(folder) => {
                    if let Err(err) = daemon.start(id, StartParams { cwd: folder, ..params }) {
                        daemon.emit(&Event::Error { id, tab: Some(tab), message: err.to_string() });
                    }
                }
            }
        });
        Ok(())
    }

    /// A stop for a tab whose worktree is still being made: it starts no Claude then.
    pub(crate) fn stop_worktree_start(&self, tab: &str) -> bool {
        let mut creating = self.creating_worktrees();
        let Some(is_stopped) = creating.get_mut(tab) else { return false };
        *is_stopped = true;
        true
    }

    fn drop_worktree(&self, folder: &Path) {
        match worktree::remove(&folder.to_string_lossy(), |_| false) {
            Ok(worktree::RemoveOutcome::Removed { .. }) => {}
            Ok(outcome) => eprintln!("agentd: worktree {} left in place: {outcome:?}", folder.display()),
            Err(err) => eprintln!("agentd: worktree {} left in place: {err}", folder.display()),
        }
    }

    pub(crate) fn merge_into_preview(self: &Arc<Self>, id: Option<u64>, folder: String) {
        self.answer_later(move || match worktree::merge_into_preview(&folder) {
            Ok(merge) => Event::PreviewMerged { id, merge },
            Err(err) => refusal(id, None, &err),
        });
    }

    /// `dry_run` only says whether the removal would go through, before the app stops the chat
    /// for it; a Claude running there does not count then.
    pub(crate) fn remove_worktree(self: &Arc<Self>, id: Option<u64>, folder: String, dry_run: bool) {
        if dry_run {
            return self.answer_later(move || match worktree::check_removal(&folder) {
                Ok(outcome) => Event::WorktreeRemoved { id, outcome },
                Err(err) => refusal(id, None, &err),
            });
        }
        let daemon = Arc::clone(self);
        // Any tab in the worktree counts, also one opened on a subfolder of it.
        let is_in_use = move |top: &Path| {
            let top = top.to_string_lossy();
            daemon.sessions().values().any(|session| worktree::is_inside(&session.params.cwd, &top))
        };
        self.answer_later(move || match worktree::remove(&folder, is_in_use) {
            Ok(outcome) => Event::WorktreeRemoved { id, outcome },
            Err(err) => refusal(id, None, &err),
        });
    }
}

fn refusal(id: Option<u64>, tab: Option<String>, err: &WorktreeError) -> Event {
    Event::WorktreeRefused { id, tab, kind: err.kind(), message: err.to_string() }
}

//! Changing mode, model and effort of a running Claude, as Claude Code's own SDK does for
//! Shift+Tab, `/model` and the effort slider: one control request each. The app hears back only
//! once Claude answered all of them, so a refused change (auto mode off for this plan) fails the
//! request instead of showing a mode Claude is not in.

use std::io::Write;

use serde_json::{json, Value};

use crate::daemon::{Daemon, DaemonError};
use crate::protocol::{Event, StartParams};

/// One change on its way to Claude.
pub(crate) struct PendingChange {
    /// Of the control request agentd sent
    request_id: String,
    /// The changes sent together; a catch-up has no `answer_to`, so this keeps two apart.
    group: String,
    /// Of the app's `configure`, answered once its last change is settled
    answer_to: Option<u64>,
    /// A refusal already answered the asker; later answers of the group only update the params.
    is_answered: bool,
    setting: Setting,
}

#[derive(Debug, Clone, PartialEq)]
enum Setting {
    Mode(String),
    Model(String),
    Effort(String),
}

impl Setting {
    fn request(&self) -> Value {
        match self {
            Self::Mode(mode) => json!({ "subtype": "set_permission_mode", "mode": mode }),
            Self::Model(model) => json!({ "subtype": "set_model", "model": model }),
            Self::Effort(effort) => json!({ "subtype": "apply_flag_settings", "settings": { "effortLevel": effort } }),
        }
    }

    /// A move to another account restarts Claude with these params: it keeps what Claude took.
    fn apply_to(self, params: &mut StartParams) {
        match self {
            Self::Mode(mode) => params.permission_mode = Some(mode),
            Self::Model(model) => params.model = Some(model),
            Self::Effort(effort) => params.effort = Some(effort),
        }
    }
}

/// The model and effort `wanted` changes; `None` and equal values change nothing. Not the mode:
/// Claude changes that itself (leaving plan mode), so the app's may be the stale one.
fn changes_from(running: &StartParams, wanted: &StartParams) -> Vec<Setting> {
    let differs = |now: &Option<String>, next: &Option<String>| next.as_ref().filter(|next| now.as_ref() != Some(*next)).cloned();
    [
        differs(&running.model, &wanted.model).map(Setting::Model),
        differs(&running.effort, &wanted.effort).map(Setting::Effort),
    ]
    .into_iter()
    .flatten()
    .collect()
}

impl<W: Write + Send + 'static> Daemon<W> {
    /// Sends the changes; `configured` (or an error) follows once Claude answered every one.
    pub(crate) fn configure(
        &self,
        id: Option<u64>,
        tab: &str,
        permission_mode: Option<String>,
        model: Option<String>,
        effort: Option<String>,
    ) -> Result<(), DaemonError> {
        let settings: Vec<Setting> = [permission_mode.map(Setting::Mode), model.map(Setting::Model), effort.map(Setting::Effort)]
            .into_iter()
            .flatten()
            .collect();
        self.send_settings(id, tab, settings)
    }

    /// A reconnecting app starts a tab that still runs with the model and effort it shows; one
    /// picked while the tab looked stopped reaches Claude this way.
    pub(crate) fn catch_up(&self, tab: &str, wanted: &StartParams) -> Result<(), DaemonError> {
        let Some(changes) = self.with_session(tab, |session| changes_from(&session.params, wanted)) else {
            return Ok(());
        };
        if changes.is_empty() {
            return Ok(());
        }
        self.send_settings(None, tab, changes)
    }

    fn send_settings(&self, id: Option<u64>, tab: &str, settings: Vec<Setting>) -> Result<(), DaemonError> {
        if settings.is_empty() {
            self.emit(&Event::Configured { id, tab: tab.to_string() });
            return Ok(());
        }
        let group = self.next_request_id();
        for setting in settings {
            let request_id = self.next_request_id();
            let request = setting.request();
            let change = PendingChange { request_id: request_id.clone(), group: group.clone(), answer_to: id, is_answered: false, setting };
            // Noted first: Claude may answer before this thread goes on.
            self.with_session(tab, |session| session.configuring.push(change)).ok_or_else(|| DaemonError::NoTab(tab.to_string()))?;
            if let Err(err) = self.write_control(tab, &request_id, request) {
                // What was written may still be taken; only the unsent change goes, and the error
                // below answers the asker for the whole group.
                self.with_session(tab, |session| {
                    session.configuring.retain(|change| change.request_id != request_id);
                    mark_answered(&mut session.configuring, &group);
                });
                return Err(err);
            }
        }
        Ok(())
    }

    /// Claude's answer to one of the changes: the app hears of a refusal at once and of success
    /// once the last change of its request is in. Every accepted change reaches the params, also
    /// one whose sibling was refused, so a restart keeps what Claude really runs with.
    pub(crate) fn settle_setting(&self, tab: &str, event: &Value) {
        if event["type"] != "control_response" {
            return;
        }
        let response = &event["response"];
        let Some(request_id) = response["request_id"].as_str() else { return };
        let is_refused = response["subtype"] == "error";
        let settled = self.with_session(tab, |session| {
            let index = session.configuring.iter().position(|change| change.request_id == request_id)?;
            let change = session.configuring.remove(index);
            if is_refused {
                mark_answered(&mut session.configuring, &change.group);
            } else {
                change.setting.clone().apply_to(&mut session.params);
            }
            let is_last = !session.configuring.iter().any(|other| other.group == change.group);
            Some((change.answer_to, change.is_answered, is_last))
        });
        let Some(Some((answer_to, was_answered, is_last))) = settled else { return };
        if was_answered {
            return;
        }
        if is_refused {
            let message = response["error"].as_str().unwrap_or("Claude refused the change").to_string();
            self.emit(&Event::Error { id: answer_to, tab: None, message });
        } else if is_last {
            self.emit(&Event::Configured { id: answer_to, tab: tab.to_string() });
        }
    }

    /// Claude exited with changes unanswered: the app keeps them for the next start, as it does
    /// for a change made while the tab is stopped, instead of undoing them after a timeout.
    pub(crate) fn answer_unsettled(&self, tab: &str, pending: Vec<PendingChange>) {
        let mut groups: Vec<(String, Option<u64>)> = Vec::new();
        for change in pending.into_iter().filter(|change| !change.is_answered) {
            if !groups.iter().any(|(group, _)| *group == change.group) {
                groups.push((change.group, change.answer_to));
            }
        }
        for (_, id) in groups.into_iter().filter(|(_, id)| id.is_some()) {
            self.emit(&Event::Configured { id, tab: tab.to_string() });
        }
    }
}

fn mark_answered(pending: &mut [PendingChange], group: &str) {
    for change in pending.iter_mut().filter(|change| change.group == group) {
        change.is_answered = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn params(mode: Option<&str>, model: Option<&str>, effort: Option<&str>) -> StartParams {
        StartParams {
            tab: "t1".into(),
            profile: None,
            cwd: PathBuf::from("."),
            resume: None,
            model: model.map(String::from),
            permission_mode: mode.map(String::from),
            is_fresh: false,
            effort: effort.map(String::from),
        }
    }

    #[test]
    fn catches_up_on_a_changed_model_or_effort_only() {
        let running = params(Some("default"), Some("opus"), None);
        let wanted = params(Some("plan"), Some("haiku"), Some("low"));
        assert_eq!(changes_from(&running, &wanted), vec![Setting::Model("haiku".into()), Setting::Effort("low".into())]);
    }

    #[test]
    fn leaves_what_the_app_does_not_name() {
        let running = params(Some("plan"), Some("opus"), Some("max"));
        assert!(changes_from(&running, &params(None, None, None)).is_empty());
    }
}

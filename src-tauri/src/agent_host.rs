//! The commands the window reaches agentd through, on this machine and on SSH machines alike.

use tauri::State;

use crate::connections::{Connections, ConnectionError, Machine};

/// Window event carrying one agentd event as a JSON string.
pub const AGENTD_EVENT: &str = "agentd";

#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error(transparent)]
    Connection(#[from] ConnectionError),
}

impl serde::Serialize for HostError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// One protocol line for this machine (`machine` empty) or an SSH machine; the answer
/// arrives as an `agentd` event. Returns the id of the connection it went out on, which its
/// `disconnected` event names.
#[tauri::command]
pub async fn agentd_request(
    line: String,
    machine: Machine,
    connections: State<'_, Connections>,
) -> Result<u64, HostError> {
    Ok(connections.send(&machine, &line)?)
}

//! Bull's own list of other machines, in `~/.nexron-chat/machines.json`. A machine's name is what
//! the app calls it everywhere (tabs, queries, the sidebar); its host, user and port are how ssh
//! reaches it. `~/.ssh/config` only offers suggestions for the setup assistant.

use std::fs;
use std::io;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::connections::{Connections, home_folder, lock};
use crate::machine_os::MachineOs;
use crate::machine_setup::{self, Probe, ProbeReason};

const DATA_FOLDER: &str = ".nexron-chat";
const STORE_FILE: &str = "machines.json";
const MAX_NAME_CHARS: usize = 40;
/// The keys ssh tries by default, in its order.
const PUBLIC_KEY_FILES: [&str; 3] = ["id_ed25519.pub", "id_ecdsa.pub", "id_rsa.pub"];
/// The login GitHub, GitLab and other Git hosts expect over ssh.
const GIT_USER: &str = "git";
/// Their own guides set up a `Host` for these without a `User` line, the user sits in the clone URL.
const GIT_SERVICES: [&str; 7] = [
    "github.com",
    "ssh.github.com",
    "gitlab.com",
    "altssh.gitlab.com",
    "bitbucket.org",
    "ssh.dev.azure.com",
    "codeberg.org",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MachineEntry {
    pub name: String,
    /// What ssh connects to: an alias from `~/.ssh/config`, a host name or an IP address.
    pub host: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    /// What the last check found; see `system`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub os: Option<MachineOs>,
}

impl MachineEntry {
    /// A machine never checked counts as Windows: every machine listed before Bull knew other
    /// systems was one.
    pub fn system(&self) -> MachineOs {
        self.os.unwrap_or(MachineOs::Windows)
    }

    /// A `~/.ssh/config` host as a machine of the same name.
    fn for_host(host: String) -> Self {
        Self { name: host.clone(), host, user: None, port: None, os: None }
    }

    /// `user@host`, or the host alone so `~/.ssh/config` supplies the user.
    pub fn destination(&self) -> String {
        match &self.user {
            Some(user) => format!("{user}@{}", self.host),
            None => self.host.clone(),
        }
    }

    /// The port option for ssh (`-p`) or scp (`-P`), empty for the default.
    pub fn port_args(&self, flag: &str) -> Vec<String> {
        self.port.map(|port| vec![flag.to_string(), port.to_string()]).unwrap_or_default()
    }

    /// Everything ssh needs after its own options to reach this machine.
    pub fn ssh_args(&self) -> Vec<String> {
        let mut args = self.port_args("-p");
        args.push(self.destination());
        args
    }
}

#[derive(Debug, thiserror::Error)]
pub enum MachinesError {
    #[error("home folder unknown")]
    NoHome,
    #[error("cannot read or write {0}: {1}")]
    Store(PathBuf, io::Error),
    #[error("{0} is not valid JSON: {1}")]
    Corrupt(PathBuf, serde_json::Error),
    #[error("invalid machine: {0}")]
    Invalid(&'static str),
    #[error("there is already a machine called {0}")]
    Taken(String),
}

impl Serialize for MachinesError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

fn store_path() -> Result<PathBuf, MachinesError> {
    Ok(home_folder().ok_or(MachinesError::NoHome)?.join(DATA_FOLDER).join(STORE_FILE))
}

/// `None` while the file was never written: the first list migrates then.
fn load() -> Result<Option<Vec<MachineEntry>>, MachinesError> {
    let path = store_path()?;
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map(Some).map_err(|err| MachinesError::Corrupt(path, err)),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(MachinesError::Store(path, err)),
    }
}

/// Written beside the file and renamed, so a crash never leaves half a list.
fn save(entries: &[MachineEntry]) -> Result<(), MachinesError> {
    let path = store_path()?;
    let staged = path.with_extension("json.new");
    let text = serde_json::to_string_pretty(entries).map_err(|err| MachinesError::Corrupt(path.clone(), err))?;
    let write = || {
        if let Some(folder) = path.parent() {
            fs::create_dir_all(folder)?;
        }
        fs::write(&staged, text)?;
        fs::rename(&staged, &path)
    };
    write().map_err(|err| MachinesError::Store(path.clone(), err))
}

/// Changes the list one at a time; the first list also migrates under it, exactly once.
#[derive(Default)]
pub struct MachineStore(Mutex<()>);

impl MachineStore {
    /// The machines Bull connects to. The very first call adopts the `~/.ssh/config` hosts that
    /// already work as one (see `migrate`).
    pub fn list(&self) -> Result<Vec<MachineEntry>, MachinesError> {
        let _guard = lock(&self.0);
        if let Some(entries) = load()? {
            return Ok(entries);
        }
        let entries = migrate(ssh_config_hosts(), |entry| machine_setup::probe(entry, false));
        save(&entries)?;
        Ok(entries)
    }

    /// Adds the machine, or puts it in the place of `replacing` (an entry the assistant corrects).
    pub fn add(&self, entry: MachineEntry, replacing: Option<&str>) -> Result<Vec<MachineEntry>, MachinesError> {
        let entry = validated(entry)?;
        let _guard = lock(&self.0);
        let entries = put(load()?.unwrap_or_default(), entry, replacing)?;
        save(&entries)?;
        Ok(entries)
    }

    /// Remembers what a check found the machine to run, for its next connection. Only for the
    /// entry that still has the checked host: the user may have changed it meanwhile.
    pub fn record_os(&self, checked: &MachineEntry, os: MachineOs) -> Result<(), MachinesError> {
        let _guard = lock(&self.0);
        let mut entries = load()?.unwrap_or_default();
        let Some(listed) = entries.iter_mut().find(|entry| entry.name == checked.name && entry.host == checked.host) else {
            return Ok(());
        };
        if listed.os == Some(os) {
            return Ok(());
        }
        listed.os = Some(os);
        save(&entries)
    }

    pub fn remove(&self, name: &str) -> Result<Vec<MachineEntry>, MachinesError> {
        let _guard = lock(&self.0);
        let mut entries = load()?.unwrap_or_default();
        entries.retain(|entry| entry.name != name);
        save(&entries)?;
        Ok(entries)
    }
}

/// The list with `entry` in it: in the place of `replacing` when that is listed, else at the end.
fn put(mut entries: Vec<MachineEntry>, entry: MachineEntry, replacing: Option<&str>) -> Result<Vec<MachineEntry>, MachinesError> {
    let at = replacing.and_then(|name| entries.iter().position(|known| known.name == name));
    let is_taken =
        entries.iter().enumerate().any(|(index, known)| Some(index) != at && known.name.eq_ignore_ascii_case(&entry.name));
    if is_taken {
        return Err(MachinesError::Taken(entry.name));
    }
    match at {
        Some(index) => {
            // The assistant's form knows no system; the same host still runs the one checked.
            let os = entry.os.or(entries[index].os.filter(|_| entries[index].host == entry.host));
            entries[index] = MachineEntry { os, ..entry };
        }
        None => entries.push(entry),
    }
    Ok(entries)
}

/// Before this list, every `~/.ssh/config` host was a machine. Each one is asked once, in
/// parallel, and kept unless it proves it is none: refused login, no agentd, no system Bull runs on, a host
/// ssh never connected to (`github.com` usually). An offline host stays, it may be the server that
/// is off right now, and so does one whose key changed: its card says how to fix that. Without
/// accepting new host keys, so the user's `known_hosts` stays as it is.
fn migrate(hosts: Vec<String>, probe: impl Fn(&MachineEntry) -> Probe + Sync) -> Vec<MachineEntry> {
    let candidates: Vec<MachineEntry> = hosts.into_iter().map(MachineEntry::for_host).collect();
    let probes: Vec<Option<Probe>> = thread::scope(|scope| {
        let probe = &probe;
        let asks: Vec<_> = candidates.iter().map(|entry| scope.spawn(move || probe(entry))).collect();
        asks.into_iter().map(|ask| ask.join().ok()).collect()
    });
    candidates
        .into_iter()
        .zip(probes)
        .filter_map(|(entry, probe)| {
            let (reason, os) = probe.map_or((ProbeReason::Offline, None), |probe| (probe.reason, probe.os));
            let is_kept = matches!(
                reason,
                ProbeReason::Ok | ProbeReason::Offline | ProbeReason::AgentdBlocked | ProbeReason::HostKeyChanged
            );
            is_kept.then_some(MachineEntry { os, ..entry })
        })
        .collect()
}

/// The machine of that name, or for a name Bull does not list (a tab from before the list) the
/// name itself as an ssh host, as it always was.
pub fn resolve(name: &str) -> Result<MachineEntry, MachinesError> {
    let listed = load()?.unwrap_or_default().into_iter().find(|entry| entry.name == name);
    match listed {
        Some(entry) => Ok(entry),
        None => {
            check_host(name)?;
            Ok(MachineEntry::for_host(name.to_string()))
        }
    }
}

/// `~/.ssh/config` hosts Bull does not list yet, for the assistant to offer.
pub fn suggestions() -> Result<Vec<String>, MachinesError> {
    let listed = load()?.unwrap_or_default();
    Ok(ssh_config_hosts()
        .into_iter()
        .filter(|host| !listed.iter().any(|entry| entry.host.eq_ignore_ascii_case(host)))
        .collect())
}

/// Everything here ends up on ssh's command line: a leading `-` would turn into an option.
pub fn validated(entry: MachineEntry) -> Result<MachineEntry, MachinesError> {
    let name = entry.name.trim().to_string();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS || name.chars().any(char::is_control) {
        return Err(MachinesError::Invalid("name"));
    }
    let host = entry.host.trim().to_string();
    check_host(&host)?;
    let user = entry.user.map(|user| user.trim().to_string()).filter(|user| !user.is_empty());
    if let Some(user) = &user
        && (user.starts_with('-') || !user.chars().all(|c| c.is_alphanumeric() || "._-\\".contains(c)))
    {
        return Err(MachinesError::Invalid("user"));
    }
    if entry.port == Some(0) {
        return Err(MachinesError::Invalid("port"));
    }
    Ok(MachineEntry { name, host, user, port: entry.port, os: entry.os })
}

fn check_host(host: &str) -> Result<(), MachinesError> {
    let allowed = |c: char| c.is_alphanumeric() || ".-_:[]%".contains(c);
    if host.is_empty() || host.starts_with('-') || !host.chars().all(allowed) {
        return Err(MachinesError::Invalid("host"));
    }
    Ok(())
}

fn ssh_config_hosts() -> Vec<String> {
    let config = home_folder().and_then(|home| fs::read_to_string(home.join(".ssh").join("config")).ok());
    config.map(|text| hosts_in(&text)).unwrap_or_default()
}

/// One `Host` section of `~/.ssh/config`, with the options that tell a Git host.
#[derive(Default)]
struct HostBlock {
    aliases: Vec<String>,
    user: Option<String>,
    host_name: Option<String>,
}

impl HostBlock {
    /// Logs in as `git` or reaches a known Git service. Only the section's own options count; a
    /// `User git` in `Host *` or above the first section is not read.
    fn is_git_host(&self) -> bool {
        self.user.as_deref().is_some_and(|user| user.eq_ignore_ascii_case(GIT_USER))
            || self.host_name.as_deref().is_some_and(is_git_service)
    }
}

/// Host aliases from `~/.ssh/config`, without wildcard patterns and without Git hosts (github.com,
/// gitlab.com, any `User git`): those serve repositories, they are no machine to connect.
fn hosts_in(config: &str) -> Vec<String> {
    host_blocks(config)
        .into_iter()
        .filter(|block| !block.is_git_host())
        .flat_map(|block| block.aliases)
        .filter(|alias| !is_git_service(alias))
        .collect()
}

/// Every `Host` or `Match` line opens a section that runs to the next one. Lines before the first
/// and `Match` sections give no aliases. As in ssh, the first value of an option wins.
fn host_blocks(config: &str) -> Vec<HostBlock> {
    let mut blocks = vec![HostBlock::default()];
    for (key, value) in config.lines().filter_map(keyword_of) {
        let value = value.trim_matches('"');
        if key.eq_ignore_ascii_case("host") || key.eq_ignore_ascii_case("match") {
            let aliases = if key.eq_ignore_ascii_case("host") { aliases_in(value) } else { Vec::new() };
            blocks.push(HostBlock { aliases, ..HostBlock::default() });
            continue;
        }
        let Some(block) = blocks.last_mut() else { continue };
        let option = match key.to_ascii_lowercase().as_str() {
            "user" => &mut block.user,
            "hostname" => &mut block.host_name,
            _ => continue,
        };
        option.get_or_insert_with(|| value.to_string());
    }
    blocks
}

fn is_git_service(host: &str) -> bool {
    GIT_SERVICES.iter().any(|service| host.eq_ignore_ascii_case(service))
}

/// `Keyword value` or `Keyword=value`, as ssh reads it; `None` for blank lines and comments.
fn keyword_of(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.starts_with('#') {
        return None;
    }
    let (key, value) = line.split_once(|c: char| c.is_whitespace() || c == '=')?;
    Some((key, value.trim_start_matches(|c: char| c.is_whitespace() || c == '=')))
}

fn aliases_in(patterns: &str) -> Vec<String> {
    patterns
        .split_whitespace()
        .map(|host| host.trim_matches('"'))
        .filter(|host| !host.is_empty() && !host.contains(['*', '?', '!']))
        .map(str::to_string)
        .collect()
}

/// The other machines the user can open tabs on; the first call may ask each ssh host once.
#[tauri::command(async)]
pub fn list_machines(store: State<'_, MachineStore>) -> Result<Vec<MachineEntry>, MachinesError> {
    store.list()
}

#[tauri::command(async)]
pub fn machine_suggestions() -> Result<Vec<String>, MachinesError> {
    suggestions()
}

/// The public key ssh offers first, for the assistant to put on a machine that refuses it; `None`
/// when there is none yet.
#[tauri::command(async)]
pub fn ssh_public_key() -> Option<String> {
    let folder = home_folder()?.join(".ssh");
    PUBLIC_KEY_FILES.iter().find_map(|file| fs::read_to_string(folder.join(file)).ok()).map(|key| key.trim().to_string())
}

#[tauri::command(async)]
pub fn add_machine(
    store: State<'_, MachineStore>,
    entry: MachineEntry,
    replacing: Option<String>,
) -> Result<Vec<MachineEntry>, MachinesError> {
    store.add(entry, replacing.as_deref())
}

#[tauri::command(async)]
pub fn remove_machine(
    store: State<'_, MachineStore>,
    connections: State<'_, Connections>,
    name: String,
) -> Result<Vec<MachineEntry>, MachinesError> {
    connections.disconnect(&name);
    store.remove(&name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, host: &str) -> MachineEntry {
        MachineEntry { name: name.into(), host: host.into(), user: None, port: None, os: None }
    }

    #[test]
    fn reads_host_aliases_and_skips_patterns() {
        let config = "Host nexron-server\n  HostName 10.0.0.2\n\nHost *\n  ServerAliveInterval 30\nHost box work-pc\n# Host commented\n";
        assert_eq!(hosts_in(config), vec!["nexron-server", "box", "work-pc"]);
    }

    #[test]
    fn skips_git_hosts() {
        let config = "Host github.com\n  User git\nHost gitlab.com\n  User=\"git\"\nHost server\n  User admin\n\
                      Match host gitea\n  User git\nHost pi\n";
        assert_eq!(hosts_in(config), vec!["server", "pi"]);
    }

    #[test]
    fn skips_git_services_without_a_user_line() {
        let config = "Host github.com\n  IdentityFile ~/.ssh/id_ed25519\nHost work-git\n  HostName GitLab.com\n\
                      Host box github.com\nHost \"quoted\"\n";
        assert_eq!(hosts_in(config), vec!["box", "quoted"]);
    }

    #[test]
    fn reads_the_first_user_like_ssh() {
        let config = "Host shared\n  User git\n  User admin\nHost server\n  User admin\n  User git\n";
        assert_eq!(hosts_in(config), vec!["server"]);
    }

    #[test]
    fn migration_keeps_working_and_offline_hosts_only() {
        let hosts = ["server", "github.com", "laptop", "pi", "blocked", "reinstalled", "new"].map(String::from).to_vec();
        let kept = migrate(hosts, |entry| {
            let reason = match entry.host.as_str() {
                "server" => ProbeReason::Ok,
                "github.com" => ProbeReason::UnsupportedSystem,
                "laptop" => ProbeReason::Offline,
                "pi" => ProbeReason::AuthFailed,
                "reinstalled" => ProbeReason::HostKeyChanged,
                "new" => ProbeReason::HostKeyUnknown,
                _ => ProbeReason::AgentdBlocked,
            };
            let os = (reason == ProbeReason::Ok).then_some(MachineOs::Linux);
            Probe { reason, version: None, detail: None, known_host: None, os }
        });
        let names: Vec<&str> = kept.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, ["server", "laptop", "blocked", "reinstalled"]);
        assert_eq!(kept[0].os, Some(MachineOs::Linux));
        assert_eq!(kept[1].os, None);
    }

    #[test]
    fn a_corrected_entry_keeps_the_system_of_its_host() {
        let listed = vec![MachineEntry { os: Some(MachineOs::Macos), ..entry("mac", "mac.local") }];
        let renamed = MachineEntry { user: Some("alex".into()), ..entry("mac", "mac.local") };
        assert_eq!(put(listed.clone(), renamed, Some("mac")).unwrap()[0].os, Some(MachineOs::Macos));
        assert_eq!(put(listed, entry("mac", "10.0.0.9"), Some("mac")).unwrap()[0].os, None);
    }

    #[test]
    fn a_machine_listed_before_systems_were_known_is_windows() {
        let old: MachineEntry = serde_json::from_str(r#"{"name":"server","host":"nexron-server"}"#).unwrap();
        assert_eq!(old.system(), MachineOs::Windows);
        let mac = MachineEntry { os: Some(MachineOs::Macos), ..entry("mac", "mac") };
        assert_eq!(serde_json::to_string(&mac).unwrap(), r#"{"name":"mac","host":"mac","os":"macos"}"#);
    }

    #[test]
    fn puts_a_corrected_machine_in_the_place_of_the_old_one() {
        let listed = vec![entry("server", "nexron-server"), entry("box", "box")];
        let corrected = MachineEntry { user: Some("alex".into()), ..entry("server", "10.0.0.2") };
        let names = |entries: &[MachineEntry]| entries.iter().map(|known| known.host.clone()).collect::<Vec<_>>();
        assert_eq!(names(&put(listed.clone(), corrected, Some("server")).unwrap()), ["10.0.0.2", "box"]);
        assert_eq!(names(&put(listed.clone(), entry("pi", "pi"), None).unwrap()), ["nexron-server", "box", "pi"]);
        assert!(matches!(put(listed.clone(), entry("Box", "other"), None), Err(MachinesError::Taken(_))));
        assert!(matches!(put(listed, entry("box", "other"), Some("server")), Err(MachinesError::Taken(_))));
    }

    #[test]
    fn builds_the_ssh_destination_with_user_and_port() {
        let plain = entry("server", "nexron-server");
        assert_eq!(plain.ssh_args(), vec!["nexron-server"]);
        let full = MachineEntry { user: Some("alex".into()), port: Some(2222), ..entry("box", "10.0.0.5") };
        assert_eq!(full.ssh_args(), vec!["-p", "2222", "alex@10.0.0.5"]);
        assert_eq!(full.port_args("-P"), vec!["-P", "2222"]);
    }

    #[test]
    fn refuses_what_ssh_would_read_as_an_option() {
        assert!(validated(entry("x", "-oProxyCommand=calc")).is_err());
        assert!(validated(entry("x", "host name")).is_err());
        assert!(validated(MachineEntry { user: Some("-l".into()), ..entry("x", "box") }).is_err());
        assert!(validated(entry("  ", "box")).is_err());
        assert!(validated(MachineEntry { port: Some(0), ..entry("x", "box") }).is_err());
    }

    #[test]
    fn trims_and_drops_an_empty_user() {
        let cleaned = validated(MachineEntry { user: Some(" ".into()), ..entry(" Server ", " 10.0.0.2 ") }).unwrap();
        assert_eq!(cleaned, entry("Server", "10.0.0.2"));
    }
}

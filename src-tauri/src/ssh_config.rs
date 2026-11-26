//! What ssh makes of a machine. The host aliases of `~/.ssh/config` that could be Bull machines:
//! the first list adopts them, later they are the setup assistant's suggestions (Git hosts are
//! left out). And one machine's options as `ssh -G` resolves them: the name `known_hosts` keeps it
//! under, and the host the preview reaches its dev servers at.

use std::fs;
use std::net::IpAddr;
use std::process::Command;

use crate::connections::{self, home_folder};
use crate::machines::{self, MachineEntry};
use crate::remote_call::ask;

const DEFAULT_SSH_PORT: &str = "22";

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

pub fn ssh_config_hosts() -> Vec<String> {
    let config =
        home_folder().and_then(|home| fs::read_to_string(home.join(".ssh").join("config")).ok());
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
        self.user
            .as_deref()
            .is_some_and(|user| user.eq_ignore_ascii_case(GIT_USER))
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
            let aliases = if key.eq_ignore_ascii_case("host") {
                aliases_in(value)
            } else {
                Vec::new()
            };
            blocks.push(HostBlock {
                aliases,
                ..HostBlock::default()
            });
            continue;
        }
        let Some(block) = blocks.last_mut() else {
            continue;
        };
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
    GIT_SERVICES
        .iter()
        .any(|service| host.eq_ignore_ascii_case(service))
}

/// `Keyword value` or `Keyword=value`, as ssh reads it; `None` for blank lines and comments.
fn keyword_of(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.starts_with('#') {
        return None;
    }
    let (key, value) = line.split_once(|c: char| c.is_whitespace() || c == '=')?;
    Some((
        key,
        value.trim_start_matches(|c: char| c.is_whitespace() || c == '='),
    ))
}

fn aliases_in(patterns: &str) -> Vec<String> {
    patterns
        .split_whitespace()
        .map(|host| host.trim_matches('"'))
        .filter(|host| !host.is_empty() && !host.contains(['*', '?', '!']))
        .map(str::to_string)
        .collect()
}

/// What `ssh -G` makes of the machine: one `key value` line per option (reads the config, connects
/// nowhere).
fn resolved_of(entry: &MachineEntry) -> Option<String> {
    let mut command = Command::new(connections::ssh_program());
    command.arg("-G").args(entry.ssh_args());
    Some(ask(command, "", "").ok()?.stdout)
}

fn resolved_value(resolved: &str, key: &str) -> Option<String> {
    resolved.lines().find_map(|line| {
        let (name, value) = line.split_once(' ')?;
        name.eq_ignore_ascii_case(key)
            .then(|| value.trim().to_string())
    })
}

/// The name `known_hosts` keeps the machine under.
pub(crate) fn known_host_of(entry: &MachineEntry) -> Option<String> {
    known_host_in(&resolved_of(entry)?)
}

/// `hostkeyalias` wins over `hostname`; a port other than 22 is stored as `[host]:port`.
fn known_host_in(resolved: &str) -> Option<String> {
    let value = |key: &str| resolved_value(resolved, key);
    let host = value("hostkeyalias")
        .filter(|alias| alias != "none")
        .or_else(|| value("hostname"))?;
    match value("port").filter(|port| port != DEFAULT_SSH_PORT) {
        Some(port) => Some(format!("[{host}]:{port}")),
        None => Some(host),
    }
}

/// The host ssh connects to directly. `None` behind a proxy (the host may not be reachable from
/// here) or for a loopback `HostName` (a forwarded port into a VM or WSL): there `localhost` would
/// show this machine's page under the other machine's name.
fn direct_host_in(resolved: &str) -> Option<String> {
    let value = |key: &str| resolved_value(resolved, key).filter(|value| value != "none");
    if value("proxyjump").is_some() || value("proxycommand").is_some() {
        return None;
    }
    value("hostname").filter(|host| !is_loopback_host(host))
}

fn is_loopback_host(host: &str) -> bool {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    match bare.parse::<IpAddr>() {
        Ok(ip) => ip.is_loopback() || ip.is_unspecified(),
        Err(_) => {
            let name = bare.to_ascii_lowercase();
            name == "localhost" || name.ends_with(".localhost")
        }
    }
}

/// The host ssh really connects to for a machine (`HostName`, the alias resolved), for the
/// preview: a dev server's `localhost` there is that host from here. `None` when ssh cannot say
/// or the machine is not directly reachable (`direct_host_in`).
#[tauri::command(async)]
pub fn machine_host_name(name: String) -> Result<Option<String>, machines::MachinesError> {
    let entry = machines::resolve(&name)?;
    Ok(resolved_of(&entry).and_then(|resolved| direct_host_in(&resolved)))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let config =
            "Host shared\n  User git\n  User admin\nHost server\n  User admin\n  User git\n";
        assert_eq!(hosts_in(config), vec!["server"]);
    }

    #[test]
    fn names_the_machine_as_known_hosts_stores_it() {
        assert_eq!(
            known_host_in("user nexron\nhostname 100.64.0.10\nport 22\n").as_deref(),
            Some("100.64.0.10")
        );
        assert_eq!(
            known_host_in("hostname box\nport 2222\n").as_deref(),
            Some("[box]:2222")
        );
        assert_eq!(
            known_host_in("hostname box\nhostkeyalias pc\nport 22\n").as_deref(),
            Some("pc")
        );
        assert_eq!(
            known_host_in("hostname box\nhostkeyalias none\n").as_deref(),
            Some("box")
        );
    }

    #[test]
    fn reads_one_option_of_ssh_g() {
        let resolved = "user dev\nhostname devbox.example\nport 22\n";
        assert_eq!(
            resolved_value(resolved, "hostname").as_deref(),
            Some("devbox.example")
        );
        assert_eq!(
            resolved_value(resolved, "HostName").as_deref(),
            Some("devbox.example")
        );
        assert_eq!(resolved_value(resolved, "proxyjump"), None);
    }

    #[test]
    fn takes_a_direct_host_name() {
        let resolved = "hostname devbox.example\nproxycommand none\n";
        assert_eq!(direct_host_in(resolved).as_deref(), Some("devbox.example"));
    }

    #[test]
    fn refuses_a_host_behind_a_proxy() {
        assert_eq!(
            direct_host_in("hostname devbox.example\nproxyjump gate.example\n"),
            None
        );
        assert_eq!(
            direct_host_in("hostname devbox.example\nproxycommand nc %h %p\n"),
            None
        );
    }

    #[test]
    fn refuses_a_loopback_host_name() {
        for host in [
            "localhost",
            "127.0.0.1",
            "127.0.1.1",
            "::1",
            "[::1]",
            "0.0.0.0",
            "vm.localhost",
        ] {
            assert_eq!(
                direct_host_in(&format!("hostname {host}\nport 2222\n")),
                None,
                "{host}"
            );
        }
    }
}

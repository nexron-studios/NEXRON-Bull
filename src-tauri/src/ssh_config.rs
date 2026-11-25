//! The host aliases of `~/.ssh/config` that could be Bull machines: the first list adopts them,
//! later they are the setup assistant's suggestions. Git hosts are left out.

use std::fs;

use crate::connections::home_folder;

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
        let config = "Host shared\n  User git\n  User admin\nHost server\n  User admin\n  User git\n";
        assert_eq!(hosts_in(config), vec!["server"]);
    }
}

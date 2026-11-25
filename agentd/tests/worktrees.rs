//! A chat's worktree from creation through `preview` to removal, against real git repositories in
//! a temp folder. Run with `cargo test --features fake-claude`.
#![cfg(feature = "fake-claude")]

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

/// A fetch and a merge per request; git on Windows is slow to start.
const WAIT: Duration = Duration::from_secs(60);

struct Agentd {
    child: Child,
    stdin: ChildStdin,
    events: Receiver<Value>,
}

impl Agentd {
    fn spawn() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_agentd"))
            .arg("stdio")
            .env("AGENTD_CLAUDE", env!("CARGO_BIN_EXE_fake-claude"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("agentd starts");
        let stdout = child.stdout.take().expect("piped stdout");
        let (sender, events) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                sender.send(serde_json::from_str(&line).expect("agentd writes JSON lines")).ok();
            }
        });
        let stdin = child.stdin.take().expect("piped stdin");
        Self { child, stdin, events }
    }

    /// The answer to `request`, which gets `id`; an error answer fails the test.
    fn ask(&mut self, id: u64, mut request: Value) -> Value {
        request["id"] = json!(id);
        writeln!(self.stdin, "{request}").unwrap();
        loop {
            let event = self.events.recv_timeout(WAIT).expect("answer before timeout");
            if event["id"] == id {
                assert_ne!(event["type"], "error", "{event}");
                return event;
            }
        }
    }
}

fn git(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git").args(args).current_dir(dir).output().expect("git runs");
    assert!(output.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&output.stderr));
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn commit(dir: &Path, file: &str, text: &str) {
    std::fs::write(dir.join(file), text).unwrap();
    git(dir, &["add", file]);
    git(dir, &["commit", "--quiet", "-m", &format!("change {file}")]);
}

/// `base/origin.git` with one commit on `main`, cloned to `base/projects/app`.
fn repository(name: &str) -> (PathBuf, PathBuf) {
    let base = std::env::temp_dir().join(format!("agentd-worktrees-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let seed = base.join("seed");
    std::fs::create_dir_all(&seed).unwrap();
    git(&seed, &["init", "--quiet", "-b", "main"]);
    git(&seed, &["config", "user.email", "test@example.com"]);
    git(&seed, &["config", "user.name", "Test"]);
    commit(&seed, "app.txt", "one\n");
    git(&base, &["clone", "--quiet", "--bare", "seed", "origin.git"]);
    std::fs::create_dir_all(base.join("projects")).unwrap();
    git(&base.join("projects"), &["clone", "--quiet", "../origin.git", "app"]);
    let app = base.join("projects").join("app");
    git(&app, &["config", "user.email", "test@example.com"]);
    git(&app, &["config", "user.name", "Test"]);
    (base, app)
}

fn create(agentd: &mut Agentd, id: u64, app: &Path, hint: &str) -> PathBuf {
    let made = agentd.ask(id, json!({ "op": "create_worktree", "cwd": app, "hint": hint, "root": null }));
    assert_eq!(made["type"], "worktree_created");
    assert_eq!(made["base"], "origin/main");
    PathBuf::from(made["path"].as_str().unwrap())
}

#[test]
fn a_chat_worktree_goes_through_preview_and_is_removed_once_merged() {
    let (base, app) = repository("flow");
    let mut agentd = Agentd::spawn();

    let calendar = create(&mut agentd, 1, &app, "Bitte den Kalender um eine Wochenansicht erweitern");
    assert_eq!(calendar, base.join("worktrees").join("app-kalender-wochenansicht-erweitern"));
    assert_eq!(git(&calendar, &["branch", "--show-current"]), "feat/kalender-wochenansicht-erweitern");
    let branch = agentd.ask(2, json!({ "op": "branch", "cwd": calendar }));
    assert_eq!((&branch["branch"], &branch["is_worktree"]), (&json!("feat/kalender-wochenansicht-erweitern"), &json!(true)));
    assert_eq!(agentd.ask(3, json!({ "op": "branch", "cwd": app }))["is_worktree"], false);

    // The same topic again gets its own name.
    let again = create(&mut agentd, 4, &app, "Kalender Wochenansicht erweitern");
    assert!(again.ends_with("app-kalender-wochenansicht-erweitern-2"), "{again:?}");

    // No commit yet: nothing to merge, but preview now exists in the main checkout.
    std::fs::write(calendar.join("draft.txt"), "wip").unwrap();
    let merge = agentd.ask(5, json!({ "op": "merge_into_preview", "worktree": calendar }));
    assert_eq!(merge["outcome"], json!({ "kind": "up_to_date" }));
    assert_eq!((&merge["created_preview"], &merge["has_uncommitted"]), (&json!(true), &json!(true)));
    assert_eq!(git(&app, &["branch", "--show-current"]), "preview");

    // Uncommitted work keeps the worktree.
    let refused = agentd.ask(6, json!({ "op": "remove_worktree", "worktree": calendar }));
    assert_eq!(refused["outcome"], json!({ "kind": "uncommitted", "files": ["draft.txt"] }));
    std::fs::remove_file(calendar.join("draft.txt")).unwrap();

    commit(&calendar, "app.txt", "week view\n");
    let merge = agentd.ask(7, json!({ "op": "merge_into_preview", "worktree": calendar }));
    assert_eq!(merge["outcome"], json!({ "kind": "merged", "commits": 1 }));
    assert_eq!(merge["created_preview"], false);
    // Line endings follow the machine's `core.autocrlf`.
    assert_eq!(std::fs::read_to_string(app.join("app.txt")).unwrap().trim_end(), "week view");

    // Another chat that changed the same line clashes with the first one, and preview stays clean.
    commit(&again, "app.txt", "month view\n");
    let clash = agentd.ask(8, json!({ "op": "merge_into_preview", "worktree": again }));
    assert_eq!(
        clash["outcome"],
        json!({ "kind": "conflict", "files": ["app.txt"], "branches": ["feat/kalender-wochenansicht-erweitern"] })
    );
    assert_eq!(git(&app, &["status", "--porcelain"]), "");

    // In preview is not merged: the commit is not on origin/main yet.
    let refused = agentd.ask(9, json!({ "op": "remove_worktree", "worktree": calendar }));
    assert_eq!(refused["outcome"], json!({ "kind": "unmerged", "commits": 1, "integration": "origin/main" }));

    // Squash-merged on the remote: the content is in, the commit itself is not.
    let squash = base.join("squash");
    git(&base, &["clone", "--quiet", "origin.git", "squash"]);
    git(&squash, &["config", "user.email", "test@example.com"]);
    git(&squash, &["config", "user.name", "Test"]);
    commit(&squash, "app.txt", "week view\n");
    git(&squash, &["push", "--quiet", "origin", "main"]);

    let removed = agentd.ask(10, json!({ "op": "remove_worktree", "worktree": calendar }));
    assert_eq!(removed["outcome"], json!({ "kind": "removed", "branch": "feat/kalender-wochenansicht-erweitern" }));
    assert!(!calendar.exists());
    assert_eq!(git(&app, &["branch", "--list", "feat/kalender-wochenansicht-erweitern"]), "");

    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[test]
fn removal_waits_for_a_running_chat_and_spares_linked_folders() {
    let (_base, app) = repository("removal");
    let mut agentd = Agentd::spawn();
    let worktree = create(&mut agentd, 1, &app, "linked modules");

    agentd.ask(2, json!({ "op": "start", "tab": "t1", "cwd": worktree, "profile": null, "resume": null, "model": null, "permission_mode": null }));
    let busy = agentd.ask(3, json!({ "op": "remove_worktree", "worktree": worktree }));
    assert_eq!(busy["outcome"], json!({ "kind": "in_use" }));
    writeln!(agentd.stdin, "{}", json!({ "op": "stop", "tab": "t1" })).unwrap();
    loop {
        let event = agentd.events.recv_timeout(WAIT).expect("exited before timeout");
        if event["type"] == "exited" {
            break;
        }
    }

    // A junction to the main checkout's modules, ignored like node_modules is.
    let modules = app.join("node_modules");
    std::fs::create_dir_all(&modules).unwrap();
    std::fs::write(modules.join("kept.js"), "").unwrap();
    std::fs::write(worktree.join(".gitignore"), "node_modules\n").unwrap();
    git(&worktree, &["add", ".gitignore"]);
    git(&worktree, &["commit", "--quiet", "-m", "ignore modules"]);
    git(&worktree, &["push", "--quiet", "origin", "HEAD:main"]);
    link(&modules, &worktree.join("node_modules"));

    let removed = agentd.ask(4, json!({ "op": "remove_worktree", "worktree": worktree }));
    assert_eq!(removed["outcome"]["kind"], "removed");
    assert!(!worktree.exists());
    assert!(modules.join("kept.js").exists(), "the link's target must survive");

    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[test]
fn a_main_checkout_that_is_not_ready_for_preview_is_left_alone() {
    let (_base, app) = repository("main-busy");
    let mut agentd = Agentd::spawn();
    let worktree = create(&mut agentd, 1, &app, "Header");
    commit(&worktree, "header.txt", "header
");

    // No preview yet, and switching would carry the user's edit along.
    std::fs::write(app.join("app.txt"), "edited
").unwrap();
    let dirty = agentd.ask(2, json!({ "op": "merge_into_preview", "worktree": worktree }));
    assert_eq!(dirty["outcome"], json!({ "kind": "main_dirty" }));
    assert_eq!(git(&app, &["branch", "--show-current"]), "main");
    git(&app, &["checkout", "--", "app.txt"]);

    // preview exists, but the user switched the main checkout elsewhere.
    git(&app, &["branch", "preview"]);
    let elsewhere = agentd.ask(3, json!({ "op": "merge_into_preview", "worktree": worktree }));
    assert_eq!(elsewhere["outcome"], json!({ "kind": "main_elsewhere", "branch": "main" }));
    assert_eq!(git(&app, &["log", "-1", "--format=%s", "preview"]), "change app.txt");

    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[test]
fn a_chat_on_a_subfolder_works_in_the_same_subfolder_of_its_worktree() {
    let (base, app) = repository("subfolder");
    std::fs::create_dir_all(app.join("src")).unwrap();
    commit(&app, "src/lib.txt", "lib
");
    git(&app, &["push", "--quiet", "origin", "main"]);
    let mut agentd = Agentd::spawn();

    let made = create(&mut agentd, 1, &app.join("src"), "Parser");
    assert_eq!(made, base.join("worktrees").join("app-parser").join("src"));

    // The removal finds the worktree from its subfolder too.
    let removed = agentd.ask(2, json!({ "op": "remove_worktree", "worktree": made }));
    assert_eq!(removed["outcome"], json!({ "kind": "removed", "branch": "feat/parser" }));
    assert!(!base.join("worktrees").join("app-parser").exists());

    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[test]
fn a_retry_for_the_same_tab_gets_the_worktree_made_the_first_time() {
    let (base, app) = repository("retry");
    let mut agentd = Agentd::spawn();
    let ask = |hint: &str| json!({ "op": "create_worktree", "cwd": app, "hint": hint, "root": null, "tab": "t1" });

    let first = agentd.ask(1, ask("Login"));
    let again = agentd.ask(2, ask("Login"));
    assert_eq!((&again["path"], &again["branch"]), (&first["path"], &json!("feat/login")));
    assert!(!base.join("worktrees").join("app-login-2").exists());

    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[test]
fn a_default_branch_with_another_name_is_the_integration_branch() {
    let (base, app) = repository("trunk");
    git(&app, &["push", "--quiet", "origin", "main:trunk"]);
    git(&base.join("origin.git"), &["symbolic-ref", "HEAD", "refs/heads/trunk"]);
    git(&app, &["push", "--quiet", "origin", "--delete", "main"]);
    git(&app, &["remote", "set-head", "origin", "trunk"]);
    let mut agentd = Agentd::spawn();

    let made = agentd.ask(1, json!({ "op": "create_worktree", "cwd": app, "hint": "Menu", "root": null }));
    assert_eq!(made["base"], "origin/trunk");

    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[test]
fn a_relative_worktree_folder_is_refused() {
    let (_base, app) = repository("relative");
    let mut agentd = Agentd::spawn();

    writeln!(agentd.stdin, "{}", json!({ "id": 1, "op": "create_worktree", "cwd": app, "hint": "x", "root": "trees" })).unwrap();
    let answer = loop {
        let event = agentd.events.recv_timeout(WAIT).expect("answer before timeout");
        if event["id"] == 1 {
            break event;
        }
    };
    assert_eq!(answer["type"], "error");
    assert!(answer["message"].as_str().unwrap().contains("not a full path"), "{answer}");

    drop(agentd.stdin);
    assert!(agentd.child.wait().unwrap().success());
}

#[cfg(windows)]
fn link(target: &Path, link: &Path) {
    let status = Command::new("cmd")
        .args(["/d", "/c", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .stdout(Stdio::null())
        .status()
        .unwrap();
    assert!(status.success());
}

#[cfg(not(windows))]
fn link(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

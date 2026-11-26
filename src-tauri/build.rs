//! Builds agentd before tauri-build looks for it: the app ships it as a sidecar
//! (`bundle.externalBin`), named `binaries/agentd-<target triple>`. Here rather than in an npm
//! script, so `tauri dev`, `tauri build` and a plain `cargo check` all get the same binary.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    build_agentd();
    tauri_build::build()
}

fn build_agentd() {
    let target = env::var("TARGET").expect("cargo sets TARGET");
    let app_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR"));
    let agentd_dir = app_dir.join("..").join("agentd");
    for watched in ["src", "Cargo.toml", "Cargo.lock"] {
        println!(
            "cargo:rerun-if-changed={}",
            agentd_dir.join(watched).display()
        );
    }
    let target_dir = agentd_dir.join("target");
    // Release even in dev: unoptimised, the first usage scan over gigabytes of transcripts takes
    // 15 s instead of 1 s. Its own target folder, or this cargo would wait on the outer one's lock.
    let status = Command::new(env::var("CARGO").unwrap_or_else(|_| "cargo".into()))
        .args(["build", "--release", "--bin", "agentd", "--target", &target])
        .arg("--manifest-path")
        .arg(agentd_dir.join("Cargo.toml"))
        .arg("--target-dir")
        .arg(&target_dir)
        .env_remove("CARGO_TARGET_DIR")
        .env_remove("CARGO_ENCODED_RUSTFLAGS")
        .status()
        .expect("cannot run cargo to build agentd");
    assert!(status.success(), "building agentd failed");
    let suffix = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let built = target_dir
        .join(&target)
        .join("release")
        .join(format!("agentd{suffix}"));
    let sidecar = app_dir
        .join("binaries")
        .join(format!("agentd-{target}{suffix}"));
    copy_if_changed(&built, &sidecar);
}

/// Leaves an equal sidecar untouched, so its timestamp does not make tauri-build copy it again.
fn copy_if_changed(from: &Path, to: &Path) {
    let built = fs::read(from).expect("agentd was built but is missing");
    if fs::read(to).is_ok_and(|present| present == built) {
        return;
    }
    fs::create_dir_all(to.parent().expect("sidecar has a folder"))
        .expect("cannot create src-tauri/binaries");
    fs::write(to, built).expect("cannot write the agentd sidecar");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(to, fs::Permissions::from_mode(0o755))
            .expect("cannot make the agentd sidecar executable");
    }
}

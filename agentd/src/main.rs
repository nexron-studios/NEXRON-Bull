//! `agentd connect` relays the JSON-lines protocol on stdin/stdout to `agentd serve`, which runs
//! in the background and keeps Claude alive between connections. The app starts `connect` over
//! `ssh -T`. `agentd stdio` serves one client on stdin/stdout itself; the tests drive it.

use std::io;

fn main() {
    let result = match std::env::args().nth(1).as_deref() {
        Some("connect") => agentd::server::connect(),
        Some("serve") => agentd::server::serve(),
        Some("stdio") => {
            agentd::daemon::Daemon::new(io::stdout()).serve(io::stdin().lock());
            Ok(())
        }
        _ => {
            eprintln!("usage: agentd connect | serve | stdio");
            std::process::exit(2);
        }
    };
    if let Err(err) = result {
        eprintln!("agentd: {err}");
        std::process::exit(1);
    }
}

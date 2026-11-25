export default {
  global: {
    app_name: 'Bull',
    studio_name: 'NEXRON Studios',
    cancel: 'Abbrechen',
    save: 'Speichern',
    undo: 'Rückgängig',
    session_id: 'Session-ID {id}',
    session_id_copy: 'Session-ID {id}, Klick kopiert sie'
  },
  bridge: {
    title: 'Bull mit diesem Gerät verbinden',
    description:
      'Bull im Browser erreicht deine Chats über die Brücke auf dem Server. Sie lässt nur Geräte mit eigenem Token herein.',
    token: 'Geräte-Token',
    token_hint:
      'Steht in der Ausgabe von „npm run token“ auf dem Server. Bull merkt es sich in diesem Browser.',
    token_empty: 'Gib das Token ein.',
    token_rejected:
      'Dieses Token kennt die Brücke nicht. Erzeuge auf dem Server ein neues und gib es hier ein.',
    unreachable: 'Die Brücke antwortet gerade nicht. Bull versucht es weiter.',
    connect: 'Verbinden'
  },
  chat_search: {
    open: 'Im Chat suchen ({key})',
    placeholder: 'Im Chat suchen …',
    label: 'Suchbegriff',
    results: 'Treffer im Chat',
    count: '{current} von {total}',
    none: '0 Treffer',
    previous: 'Vorheriger Treffer',
    next: 'Nächster Treffer',
    close: 'Suche schließen',
    you: 'Du',
    claude: 'Claude',
    empty_title: 'Nichts gefunden',
    empty_hint: 'Prüf die Schreibweise oder such nach einem kürzeren Wort.',
    key_pick: 'wählen',
    key_jump: 'springen',
    key_back: 'zurück',
    key_close: 'schließen'
  },
  chat: {
    empty_title: 'Noch kein Chat offen',
    empty_hint: 'Starte eine neue Session oder setze eine frühere fort.',
    new_chat: 'Neuer Chat',
    new_title: 'Session starten',
    new_hint: 'Neue Session in einem Ordner oder eine frühere fortsetzen.',
    tab_new: 'Neu',
    tab_resume: 'Fortsetzen',
    account: 'Account',
    folder: 'Ordner',
    folder_hint: 'Voller Pfad, in dem Claude arbeiten soll.',
    model: 'Modell',
    mode: 'Modus',
    account_default: 'Standard des Kontos',
    account_default_named: 'Standard des Kontos · {name}',
    account_default_model_hint:
      'Im Konto ist kein Modell festgelegt. Claude Code nimmt dann seinen eigenen Standard für dieses Abo.',
    account_default_unknown_hint:
      'Bull konnte die Einstellungen des Kontos nicht lesen. Es gilt, was dort festgelegt ist.',
    models: { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' },
    modes: {
      default: 'Nachfragen',
      acceptEdits: 'Änderungen erlauben',
      auto: 'Auto',
      plan: 'Erst planen',
      bypassPermissions: 'Ohne Freigaben',
      dontAsk: 'Nur Erlaubtes'
    },
    start: 'Starten',
    resume_empty: 'Keine früheren Sessions gefunden.',
    resume_meta: '{account} · {folder}',
    close_tab: 'Tab schließen',
    composer_label: 'Nachricht an Claude',
    composer_placeholder: 'Nachricht an Claude …',
    send: 'Senden',
    stop: 'Stoppen',
    load_older: 'Ältere Nachrichten laden',
    loading_older: 'Ältere Nachrichten werden geladen',
    load_older_failed: 'Ältere Nachrichten nicht geladen · erneut versuchen',
    compacted: 'Verlauf wurde zusammengefasst',
    interrupted: 'Abgebrochen',
    agent_report: 'Rückmeldung von Subagent „{name}“',
    agent_report_unnamed: 'Rückmeldung von einem Subagent',
    agent_message: 'Nachricht von Agent „{name}“',
    agent_message_unnamed: 'Nachricht von einem anderen Agent',
    tool_result: 'Ergebnis',
    tool_error: 'Fehler',
    tool_input: 'Eingabe',
    tool_state: { running: 'läuft', done: 'fertig', error: 'Fehler', stopped: 'nicht beendet' },
    reads: {
      file: '{n} Datei gelesen | {n} Dateien gelesen',
      folder: '{n} Ordner angesehen | {n} Ordner angesehen',
      search: '{n} Suche | {n} Suchen',
      label: 'Gelesen und gesucht'
    },
    diff_counts: '{added} Zeilen hinzu, {removed} entfernt',
    output_before: '{n} Zeile davor | {n} Zeilen davor',
    output_less: 'Nur die letzten Zeilen',
    hook: {
      blocked_tool: '{event}-Hook hat {tool} blockiert',
      blocked: '{event}-Hook hat eingegriffen',
      failed: '{event}-Hook ist fehlgeschlagen',
      output: '{event}-Hook',
      output_tool: '{event}-Hook zu {tool}',
      command: 'Befehl des Hooks'
    },
    retry: {
      overloaded: 'Anthropic ist gerade überlastet',
      rate_limit: 'Anthropic bremst gerade ab',
      server_error: 'Anthropic meldet einen Serverfehler',
      other: 'Die Anfrage an Anthropic ist fehlgeschlagen',
      in: 'Neuer Versuch in {seconds} s',
      now: 'Versucht es gerade neu',
      attempt: 'Versuch {attempt} von {max}',
      status: 'Fehler {status}'
    },
    turn: {
      worked: 'Gearbeitet {duration}',
      seconds: '{time} s',
      minutes: '{time} min',
      hours: '{time} h',
      tokens: '{n} Tokens'
    },
    stream: {
      thought: 'Gedacht',
      thought_for: 'Gedacht · {seconds} s',
      thinking: 'Denkt nach …',
      todos: 'Schritte',
      todo_state: { pending: 'offen', in_progress: 'läuft', completed: 'erledigt' },
      sources: 'Quellen',
      loading_history: 'Verlauf wird geladen',
      awaiting_reply: 'Claude legt los',
      stop: 'Stopp',
      stop_key: 'Esc',
      elapsed: 'Laufzeit',
      tokens: '{n} Tokens',
      tokens_label: 'Bisher erzeugt',
      activity: {
        asking: 'Claude wartet auf dich',
        thinking: 'Claude denkt nach',
        writing: 'Claude schreibt',
        working: 'Claude arbeitet',
        background: 'Im Hintergrund läuft noch etwas',
        reads: 'Claude liest {target}',
        searches: 'Claude sucht {target}',
        edits: 'Claude ändert {target}',
        runs: 'Claude führt {target} aus',
        fetches: 'Claude lädt {target}',
        searches_web: 'Claude sucht im Web nach {target}',
        delegates: 'Claude gibt eine Aufgabe an einen Subagent',
        plans: 'Claude plant die Schritte',
        uses: 'Claude nutzt {tool}'
      }
    },
    scroll_down: 'Nach unten',
    copy: 'Kopieren',
    copied: 'Kopiert',
    copy_reply: 'Antwort kopieren',
    copy_prompt: 'Kopieren',
    edit_prompt: 'Bearbeiten',
    edit_prompt_busy: 'Bearbeiten geht, sobald Claude fertig ist',
    edit_prompt_no_point: 'Zu dieser Nachricht gibt es keinen Punkt zum Zurückspulen',
    sent_now: 'jetzt',
    sent_ago: 'vor {age}',
    callout: {
      info: 'Einzelheiten',
      warning: 'Achtung',
      preview: 'So siehst du es',
      todo: 'Offen',
      tip: 'Vorschlag',
      question: 'Braucht dich',
      reply: 'Antworten',
      yes: 'Ja, mach das',
      no: 'Nein',
      yes_message: 'Ja, mach das.',
      no_message: 'Nein, lass das.',
      points: '{n} Punkt | {n} Punkte'
    },
    machine: 'Rechner',
    this_machine: 'Dieser @:computer',
    no_offered_accounts:
      'Auf diesem Rechner ist kein Konto für Bull eingeschaltet. Das geht in den Einstellungen unter Konten.',
    disconnected:
      'Verbindung zu {machine} getrennt. Claude läuft dort weiter, die App verbindet sich neu.',
    disconnected_local:
      'Verbindung zu Claude auf diesem @:computer getrennt. Claude läuft im Hintergrund weiter, die App verbindet sich neu.',
    ended_hint: 'Session beendet. Deine nächste Nachricht setzt sie fort.',
    permission_title: 'Claude möchte {tool} verwenden',
    permission_needed: 'Freigabe nötig',
    permission_details: 'Alle Angaben',
    allow: 'Erlauben',
    allow_always: 'Immer erlauben',
    allow_always_for: 'Immer für {target}',
    deny: 'Ablehnen',
    deny_reason_label: 'Ablehnen mit Begründung',
    deny_reason_placeholder: 'Nein, und Claude sagen, was stattdessen …',
    deny_reason_hint: 'ablehnen und Claude das sagen',
    question_title: 'Claude hat eine Frage',
    question_other: 'Eigene Antwort …',
    question_skip: 'Überspringen',
    question_send: 'Antworten',
    plan_title: 'Claude möchte diesen Plan umsetzen',
    plan: 'Plan',
    plan_accept: 'Plan annehmen',
    plan_adjust: 'Anpassen',
    attachments: 'Angehängte Bilder',
    add_image: 'Bild anhängen',
    attachment_count: '{count} von {max} Bildern',
    remove_image: '{name} entfernen',
    open_image: '{name} ansehen',
    drop_images: 'Bilder hier ablegen',
    image_wrong_type: '{names}: nur PNG, JPEG, GIF oder WebP.',
    image_too_large: '{names}: zu groß. Eine Bilddatei darf höchstens {max} haben.',
    image_read_failed: 'Nicht lesbar: {names}.',
    image_limit: 'Höchstens {max} Bilder pro Nachricht. Nicht angehängt: {names}.',
    image_unnamed: 'Eingefügtes Bild',
    image_n: 'Bild {n}',
    image_counter: '{current} / {total}',
    previous_image: 'Vorheriges Bild',
    next_image: 'Nächstes Bild',
    close_image: 'Bild schließen',
    history_failed_title: 'Verlauf nicht geladen',
    history_failed_hint:
      'Der Verlauf dieser Session kam nicht an. Die Session selbst ist nicht verloren.',
    history_retry: 'Erneut laden',
    clawd_title: 'Clawd wartet auf die erste Anfrage',
    clawd_hint: '{machine} · {folder}. Tippen, senden, fertig.',
    clawd_hint_here: '{folder}. Tippen, senden, fertig.',
    suggestions: {
      label: 'Vorschläge für den Anfang',
      fix_tests: {
        label: 'Tests reparieren',
        prompt: 'Führ die Tests aus und reparier, was fehlschlägt.'
      },
      describe_pr: {
        label: 'PR beschreiben',
        prompt: 'Schreib eine Beschreibung für einen Pull Request zu den aktuellen Änderungen.'
      },
      explain_code: {
        label: 'Code erklären',
        prompt: 'Erklär mir, wie dieses Projekt aufgebaut ist.'
      },
      read_note: {
        label: 'Projekt-Notiz lesen',
        prompt:
          'Lies die Projekt-Notiz im Obsidian-Vault und fass Entscheidungen und Fallen zusammen.'
      }
    },
    phone: {
      back: 'Zurück zu den Sessions',
      menu: 'Mehr zu diesem Chat',
      menu_hint: 'Ordner, Konto, Kontext und Einstellungen dieses Chats.',
      settings_label: 'Modell, Denktiefe und Modus ändern, jetzt {current}',
      notifications: 'Hinweise',
      theme: 'Design'
    },
    status: {
      starting: 'startet',
      idle: 'bereit',
      working: 'arbeitet',
      asking: 'wartet auf Freigabe',
      ended: 'beendet',
      failed: 'mit Fehler beendet',
      waiting: 'wartet auf Limit',
      question: 'wartet auf deine Antwort',
      empty: 'wartet auf die erste Anfrage'
    },
    limit: {
      moved_title: 'Auf {account} umgezogen',
      moved_text:
        '{from} ist voll. Der Chat läuft auf {to} weiter, Verlauf, Subagents und /rewind-Stände sind mitgekommen.',
      moved_continue: 'Claude macht weiter, wo der Turn abbrach',
      undo: 'Rückgängig',
      full: 'voll',
      full_until: 'voll bis {at}',
      free: '{percent} % frei',
      waiting_title: 'Wartet auf {account}',
      reset: 'Reset {at} · noch {left} h',
      wait_policy:
        'Die Einstellungen sagen: warten. Bull schickt die Nachrichten beim Reset ab, auch wenn das Fenster zu ist.',
      wait_ask: '{account} ist voll. Zieh auf ein anderes Konto um oder warte auf den Reset.',
      wait_no_account:
        '{account} ist voll, und kein Konto, das dieser Ordner nutzen darf, hat noch Platz. Bull schickt die Nachrichten beim Reset ab, auch wenn das Fenster zu ist.',
      wait_undone: 'Der Chat ist zurück auf {account} und wartet dort auf den Reset.',
      move_to: 'Auf {account} umziehen',
      move_once: 'Einmal auf {account}',
      send_now: 'Jetzt senden',
      queue_label: 'Wartende Nachrichten',
      queue_images: '+{n} Bild | +{n} Bilder',
      edit: 'Bearbeiten',
      remove: 'Nicht senden',
      composer_placeholder: 'Weitere Nachricht kommt hinten in die Warteschlange …',
      nudge_title: '{account}: noch {percent} % frei, Reset in {left} h',
      nudge_title_no_reset: '{account}: noch {percent} % frei',
      nudge_text: 'Nach diesem Turn auf {candidate} weitermachen? Der Chat läuft bis dahin normal.',
      stay: 'Auf {account} bleiben',
      switch_after_turn: 'Nach dem Turn wechseln'
    }
  },
  images: {
    preview_hint: 'Klick öffnet die Vorschau',
    pasted_name: 'Bild {time}.{ext}',
    open_marked: '{name} ansehen, markiert',
    marked: 'markiert',
    mode: 'Modus',
    view: 'Ansehen',
    mark: 'Markieren',
    zoom_out: 'Verkleinern',
    zoom_in: 'Vergrößern',
    zoom_reset: 'Zoom zurücksetzen',
    copy: 'Bild kopieren',
    copy_short: 'Kopieren',
    copied: 'Bild kopiert',
    copy_failed: 'Bild nicht kopiert.',
    download: 'Herunterladen',
    tools: 'Werkzeuge',
    tool: {
      pen: 'Stift',
      highlighter: 'Marker',
      arrow: 'Pfeil',
      rect: 'Rahmen',
      pin: 'Stecknadel',
      text: 'Text',
      eraser: 'Radierer'
    },
    colors: 'Farben',
    color: {
      critical: 'Rot',
      warning: 'Gelb',
      good: 'Grün',
      brand: 'Blau',
      white: 'Weiß'
    },
    sizes: 'Stiftstärke',
    size: {
      s: 'Dünn',
      m: 'Mittel',
      l: 'Dick'
    },
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    stroke_count: 'Keine Striche | {n} Strich | {n} Striche',
    canvas: 'Zeichenfläche: mit Maus, Stift oder Finger auf das Bild zeichnen',
    comment_title: 'Kommentar für Claude',
    comment_placeholder: 'Was soll Claude hier ändern?',
    comment_placeholder_general: 'Sonst noch etwas? (optional)',
    notes_title: 'Notizen zu den Markierungen',
    note_label: 'Notiz zu dieser Stelle',
    note_placeholder: 'Was soll hier anders sein?',
    remove_mark: 'Markierung {n} entfernen',
    remove_mark_unnumbered: 'Markierung entfernen',
    text_label: 'Text im Bild',
    text_placeholder: 'Text, Enter setzt ihn',
    comment_hint:
      'Geht mit dem Bild in dein Eingabefeld, markiert, wenn du gezeichnet hast. Du kannst ihn dort noch ändern. Senden schickt beides gleich als eigene Nachricht.',
    keep_original: 'Original zusätzlich mitschicken',
    discard: 'Verwerfen',
    apply: 'Ins Eingabefeld',
    send: 'Senden',
    apply_phone_hint:
      'Pfeil nach unten: Bild und Kommentar ins Eingabefeld. Pfeil nach oben: gleich senden.',
    cancel: 'Abbrechen',
    comment_line: 'Zu {ref}: {comment}',
    reference: '[Bild {n} ({name})]',
    close_warning:
      'Kommentar oder Markierung sind noch nicht im Eingabefeld. Beim zweiten Mal werden sie verworfen.',
    too_large: 'Das markierte Bild ist zu groß für Claude.',
    marked_limit: 'Höchstens {max} Bilder pro Nachricht. Entferne erst ein Bild.',
    send_empty: 'Das Bild lässt sich nicht mitschicken, und ohne Kommentar bleibt nichts zu senden.'
  },
  sidebar: {
    loading: 'Sessions werden geladen',
    close_search: 'Suche schließen',
    label: 'Sessions',
    description: 'Alle Sessions dieses Rechners, nach dem sortiert, was sie brauchen.',
    show: 'Seitenleiste öffnen',
    hide: 'Seitenleiste einfahren',
    new_session: 'Neue Session',
    search: 'Sessions durchsuchen',
    search_placeholder: 'Titel, Ordner oder Account',
    tab_count: '{n} offener Tab | {n} offene Tabs',
    machine_state: { needs: 'braucht dich', running: 'arbeitet', done: 'fertig' },
    other_machines_state: 'Auf einem anderen Rechner: {state}',
    groups: {
      needs: 'Braucht dich',
      running: 'Läuft',
      empty: 'Noch leer',
      waiting: 'Wartet auf Limit',
      done: 'Fertig heute',
      earlier: 'Früher'
    },
    empty_chat: 'wartet auf die erste Anfrage',
    age_running: 'läuft seit {age}',
    age_finished: 'fertig vor {age}',
    empty_title: 'Kein Chat offen',
    empty_hint: 'Mit {key} startest du einen. Frühere findest du unter Übersicht.',
    empty_hint_phone: 'Frühere Chats findest du unter Übersicht.',
    no_match_title: 'Nichts gefunden',
    no_match_hint: 'Keine Session passt zu „{query}“.',
    reset_search: 'Suche zurücksetzen',
    resize: 'Breite der Seitenleiste',
    width_px: '{width} px',
    fold_hint: 'Einfahren',
    full_width: 'Volle Breite',
    rail_item: '{title}, {status}',
    offline_title: '{machine} nicht erreichbar',
    offline_hint: 'Die Liste kam nicht an. Laufende Tabs dort arbeiten weiter.',
    retry: 'Neu verbinden',
    group_empty: {
      needs: {
        title: 'Nichts wartet auf dich',
        hint: 'Braucht Claude eine Freigabe oder Antwort, steht der Chat hier.'
      },
      running: {
        title: 'Gerade läuft nichts',
        hint: 'Mit {key} startest du eine neue Session.',
        hint_phone: 'Mit + oben startest du eine neue Session.'
      },
      done: {
        title: 'Heute noch nichts fertig',
        hint: 'Was Claude heute abschließt, sammelt sich hier.'
      }
    },
    all_loaded: 'Alle {n} Sessions geladen',
    quota_label: 'Kontingent der Konten',
    queue_badge: '{n} wartet | {n} warten',
    queue_open: 'Wartende Chats von {account} zeigen',
    queue_title: 'Warteschlange von {account}',
    queue_messages: '{n} Nachricht | {n} Nachrichten',
    queue_hint: 'Geht beim Reset raus, auch bei geschlossener App. Im Abstand von 10 s.',
    quota_line: '5-Stunden-Fenster von {account}',
    quota_five_hour: '5 h',
    quota_week: 'Woche',
    quota_week_line: 'Woche von {account}',
    quota_none: 'k. A.',
    quota_loading: 'Kontingent wird geladen'
  },
  prompt_input: {
    placeholder_keys: "/ Befehle · {'@'} Dateien · ! Shell",
    shell_label: 'Shell-Befehl',
    shell_placeholder: 'Befehl für den Ordner …',
    shell_badge: 'Shell',
    shell_hint: 'Läuft in {folder}, die Ausgabe geht an Claude · {key} zurück zum Chat',
    run_shell: 'Ausführen',
    menu_label: 'Vorschläge',
    groups: { bull: 'In Bull', claude: 'Claude Code', custom: 'Eigene und Skills' },
    sources: {
      user: 'Eigener',
      project: 'Projekt',
      claude_ai_sync: 'claude.ai',
      dynamic_workflow: 'Workflow'
    },
    bull_commands: {
      compact: 'Verlauf zusammenfassen, optional mit Schwerpunkt',
      context: 'Zeigen, was den Kontext belegt',
      model: 'Modell und Denktiefe für diesen Chat',
      rewind: 'Gespräch oder Code zurückspulen',
      clear: 'Neu anfangen, der Tab bleibt offen',
      export: 'Gespräch als Markdown kopieren'
    },
    commands_hint: '{up}{down} wählen · {tab} ergänzen · {enter} ausführen · {esc} schließen',
    commands_waiting: 'Die Befehle von Claude Code kommen, sobald die Session läuft.',
    no_commands: 'Kein Befehl passt zu „{query}“.',
    files_title: 'Dateien in {folder}',
    files_title_query: 'Dateien in {folder} · „{query}“',
    files_hint: '{tab} übernehmen · Claude liest die Datei mit der Nachricht',
    files_loading: 'Dateien werden gelesen …',
    files_failed: 'Die Dateien ließen sich nicht lesen.',
    files_truncated: 'Nur die ersten {n} Dateien des Ordners',
    no_files: 'Keine Datei passt zu „{query}“.',
    folder_files: '{n} Datei | {n} Dateien',
    queue_title: 'Geht raus, sobald Claude fertig ist',
    queue_edit: 'Nachricht {n} bearbeiten',
    queue_remove: 'Nachricht {n} entfernen',
    queue_images: '{n} Bild | {n} Bilder',
    paste_chip: 'Text · {n} Zeilen',
    paste_remove: 'Eingefügten Text entfernen',
    shell_running: 'läuft …',
    shell_waiting: '{seconds} s · geht mit der nächsten Nachricht an Claude',
    shell_sent: 'an Claude',
    shell_exit: 'Exit-Code {code}',
    shell_timed_out: 'Nach {seconds} s abgebrochen',
    shell_failed: 'Lief nicht: {message}',
    shell_no_output: 'Keine Ausgabe',
    agentd_outdated: 'Der agentd auf {machine} ist älter als Bull und kann das noch nicht.',
    shell_remove: 'Befehl {command} entfernen',
    export_empty: 'Noch nichts zum Kopieren.',
    export_user: 'Du',
    export_claude: 'Claude',
    export_image: 'Bild'
  },
  theme: {
    to_light: 'Zum hellen Design wechseln',
    to_dark: 'Zum dunklen Design wechseln'
  },
  notifications: {
    title: 'Benachrichtigungen',
    description: 'Wann und wie Bull dir Bescheid sagt.',
    bell: {
      on: 'Benachrichtigungen',
      off: 'Benachrichtigungen aus',
      blocked: 'Benachrichtigungen blockiert'
    },
    master: 'Alle Benachrichtigungen',
    permission: {
      granted: '{system} zeigt sie an',
      granted_generic: 'Das System zeigt sie an',
      blocked: 'Vom System blockiert',
      blocked_hint:
        'Erlauben unter Einstellungen › System › Benachrichtigungen › Bull. Bis dahin nur im Fenster.',
      open_settings: 'Windows-Einstellungen öffnen',
      unavailable: 'Nur im Fenster',
      unavailable_hint: 'Der Browser-Tab kann keine Systemmeldungen zeigen.'
    },
    test: 'Testen',
    test_title: 'Bull',
    test_body: 'So sieht eine Benachrichtigung aus.',
    events_label: 'Sag mir Bescheid, wenn …',
    event: {
      approval: {
        title: 'eine Freigabe nötig ist',
        hint: 'Claude wartet auf dein Okay für ein Tool'
      },
      question: { title: 'Claude etwas fragt', hint: 'Auswahlkarte im Chat' },
      plan: { title: 'ein Plan bereitsteht', hint: 'Plan prüfen und annehmen' },
      finished: { title: 'ein Chat fertig ist', hint: 'Claude hat seine Antwort beendet' },
      failed: { title: 'etwas schiefgeht', hint: 'Fehler, Abbruch, Kontingent leer' },
      quota_low: {
        title: 'ein Kontingent knapp wird',
        hint: 'bei nur noch {percent} % im 5-Stunden-Fenster'
      }
    },
    how_label: 'Wie',
    background: 'Im Hintergrund',
    delivery: { os: 'System', toast: 'Im Fenster' },
    sound: 'Ton',
    footnote:
      'Der Chat, den du gerade ansiehst, meldet sich nie. Einzelne Chats stummschalten: Rechtsklick auf den Tab.',
    footnote_phone:
      'Der offene Chat meldet sich nie. Einzelne Chats: lange auf die Session drücken.',
    mute: 'Stummschalten',
    unmute: 'Benachrichtigungen an',
    muted: 'Stumm',
    quota_low: {
      title: 'Kontingent knapp · {account}',
      body: 'Im 5-Stunden-Fenster sind noch {percent} % frei.'
    },
    permission_denied:
      'Das System erlaubt keine Benachrichtigungen für Bull. Hinweise erscheinen nur im Fenster.',
    open: 'Öffnen',
    reason: {
      approval: 'Wartet auf deine Freigabe',
      question: 'Claude hat eine Frage',
      plan: 'Plan wartet auf dich',
      finished: 'Claude ist fertig',
      failed: 'Fehler oder unerwartet beendet'
    },
    queue_sent: 'Das Limit ist zurückgesetzt, die wartenden Nachrichten sind raus'
  },
  panel: {
    label: 'Details zum Chat',
    resize: 'Breite der Details',
    open_items: 'Offen',
    open_items_count: '{open} von {all}',
    show: 'Details einblenden ({key})',
    hide: 'Details ausblenden ({key})',
    machine: 'Rechner',
    folder: 'Ordner',
    branch: 'Branch',
    account: 'Konto',
    switch: 'Wechseln',
    context: 'Kontext',
    context_of: '{tokens} / {window}',
    context_label: 'Kontext zu {percent} belegt',
    context_split: { cached: 'Cache gelesen', written: 'Cache geschrieben', fresh: 'Neu' },
    context_empty: 'Steht hier nach der ersten Antwort.',
    usage: 'Nutzung',
    details: 'Details',
    five_hour_of: '5-Stunden-Fenster · {account}',
    week_all: 'Woche · alle Modelle',
    usage_empty: 'Für dieses Konto gibt es kein Kontingent.',
    subagents: 'Subagents',
    subagents_empty: 'Noch keine Subagents',
    subagents_empty_hint: 'Gibt Claude Teilaufgaben ab, siehst du die Helfer hier live.',
    subagent_actions: '{n} Aktion | {n} Aktionen',
    subagent_state: { running: 'läuft', done: 'fertig', failed: 'fehlgeschlagen' },
    connectors: 'Konnektoren',
    connectors_count: '{connected} von {total} verbunden',
    changed_files: 'Geänderte Dateien',
    changed_files_count: '{n} Datei | {n} Dateien',
    changed_files_empty: 'Noch nichts geändert',
    changed_files_empty_hint: 'Ändert Claude eine Datei, steht sie hier mit ihren Zeilen.',
    changed_files_list: 'Geänderte Dateien in diesem Chat',
    show_more: 'Mehr anzeigen ({n})',
    show_less: 'Weniger anzeigen',
    connectors_empty: 'Keine Konnektoren',
    connectors_empty_hint: 'Dieses Konto hat keine MCP-Server.',
    connectors_setup: 'Im Terminal einrichten',
    connectors_setup_title: 'MCP-Server einrichten',
    connectors_later: 'Kommen mit dem Start',
    connectors_later_hint: 'Claude meldet seine Konnektoren mit deiner nächsten Nachricht.',
    connectors_recheck: 'Neu laden',
    connectors_recheck_hint: 'Server im Terminal hinzugefügt? Lade neu, dann erscheint er hier.',
    connectors_after_turn: 'Lädt nach dieser Antwort',
    connectors_after_turn_hint:
      'Claude arbeitet gerade. Neue Server erscheinen, sobald die Antwort fertig ist.',
    connectors_restart_title: 'Neustart nötig',
    connectors_restart_hint:
      'Server hinzugefügt? Claude neu starten, damit er erscheint. Der Chat bleibt erhalten.',
    connectors_restart: 'Claude neu starten',
    connectors_restart_busy: 'Geht, sobald Claude mit der Antwort fertig ist.',
    connector_state: {
      connected: 'verbunden',
      pending: 'verbindet',
      'needs-auth': 'Anmeldung nötig',
      failed: 'Fehler',
      unknown: 'unbekannt'
    },
    sign_in: 'Anmelden',
    sign_in_title: 'Bei {name} anmelden',
    session_bar: 'Wo dieser Chat läuft'
  },
  activity: {
    title: 'Aktivität',
    tool_count: '{n} Tool | {n} Tools',
    live: 'live',
    needs_you: 'braucht dich',
    waiting: '{tool} wartet auf Freigabe',
    to_approval: 'Zur Freigabe',
    show_all: 'Im Chat zeigen | Alle {n} im Chat zeigen',
    tool_state: { running: 'läuft', done: 'fertig', failed: 'Fehler', stopped: 'abgebrochen' },
    last_turn: 'Letzter Turn: {tools}, {subagents}, {duration}',
    last_turn_untimed: 'Letzter Turn: {tools}, {subagents}',
    last_turn_no_agents: 'Letzter Turn: {tools}, {duration}',
    last_turn_untimed_no_agents: 'Letzter Turn: {tools}',
    subagent_count: '{n} Subagent | {n} Subagents',
    duration_minutes: '{time} min',
    duration_hours: '{time} h',
    steps: 'Schritte',
    resting: 'ruht',
    fresh: 'Noch nichts gelaufen',
    fresh_hint: 'Liest, sucht oder ändert Claude etwas, steht jeder Schritt hier.',
    thinking: 'Claude überlegt noch',
    writing: 'Claude antwortet gerade',
    thinking_hint: 'Der erste Schritt erscheint hier, sobald Claude ein Tool aufruft.',
    answered: 'Nur geantwortet, ohne Tools',
    answered_at_took: 'Letzter Turn um {time}, {duration}',
    answered_at: 'Letzter Turn um {time}',
    answered_on_took: 'Letzter Turn am {date} um {time}, {duration}',
    answered_on: 'Letzter Turn am {date} um {time}',
    answered_took: 'Letzter Turn: {duration}',
    answered_hint: 'Arbeitet Claude wieder, steht hier jeder Schritt.',
    subagents_running: '{n} läuft | {n} laufen',
    subagents_done: '{n} fertig',
    background: 'Im Hintergrund',
    background_hint: 'schiebt eine laufende Shell hierher',
    shell_running: 'läuft {age}',
    badge_agents: '{n} Subagent läuft | {n} Subagents laufen',
    badge_shells: '{n} Shell im Hintergrund | {n} Shells im Hintergrund',
    connected: '{n} verbunden',
    sheet_open: 'Aktivität zeigen',
    sheet_hint: 'Was Claude in diesem Chat gerade tut.'
  },
  account: {
    title: 'Konto für diesen Chat',
    description: 'Auf welchem Claude-Konto dieser Chat weiterläuft.',
    hint: 'Nur dieser Chat wechselt. Verlauf, Subagents und /rewind-Stände kommen mit.',
    unavailable: 'Wechseln geht, sobald die Session gestartet ist.',
    switch_label: 'Konto dieses Chats wechseln, jetzt {account}',
    current: 'Aktuelles Konto',
    free: '{percent} frei',
    loading: 'Konten werden geladen'
  },
  composer: {
    model_default: 'Standardmodell',
    model_version: '{model} {version}',
    model_effort: '{model} · {effort}',
    settings_summary: '{model} · {mode}',
    model_switch_label: 'Modell und Denktiefe dieses Chats wechseln, jetzt {current}',
    effort: 'Denktiefe',
    // Claude Code's own names, not translated, so they match the CLI (19.11.2026).
    efforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    model_hints: {
      opus: 'am gründlichsten',
      sonnet: 'schnell, für das meiste',
      haiku: 'am schnellsten, kleine Aufgaben'
    },
    applies_next: 'Gilt ab der nächsten Nachricht. Verlauf und Konto bleiben.',
    mode_switch_label: 'Modus {mode}, Umschalt+Tab wechselt zu {next}',
    mode_hints: {
      default: 'Claude fragt vor jeder Änderung und jedem Befehl.',
      acceptEdits: 'Claude ändert Dateien ohne zu fragen, Befehle brauchen weiter deine Freigabe.',
      plan: 'Claude liest und plant nur. Geändert wird erst, wenn du den Plan freigibst.',
      auto: 'Claude entscheidet selbst, was es ohne Nachfrage tun darf, und fragt nur bei Riskantem.',
      bypassPermissions: 'Claude tut alles, ohne zu fragen. So ist es im Konto eingestellt.',
      dontAsk:
        'Claude tut nur, was schon erlaubt ist, und fragt nie. So ist es im Konto eingestellt.'
    },
    mode_next: 'weiter zu {cycle}',
    settings_title: 'Dieser Chat',
    settings_hint: 'Modell, Denktiefe und Modus dieses Chats.',
    context: 'Kontext zu {percent} belegt',
    context_tokens: '{tokens} / {window} Tokens'
  },
  usage: {
    title: 'Nutzung',
    subtitle: 'Tokens und Limits aller Konten und Rechner',
    subtitle_single: 'Tokens und Limits aller Konten',
    range_label: 'Zeitraum',
    range_days: '{n} Tage',
    range_days_short: '{n} T',
    refresh: 'Kontingent neu abfragen',
    quota_heading: 'Kontingent',
    on_machine: 'auf {machine}',
    windows: {
      five_hour: '5 h',
      seven_day: 'Woche',
      seven_day_opus: 'Woche Opus',
      seven_day_sonnet: 'Woche Sonnet'
    },
    reset_hours: 'Reset {hours}:{minutes} h',
    reset_days: 'Reset {days} T {hours} h',
    near_limit: 'Fast ausgeschöpft',
    problems: {
      no_login: 'Nicht mit einem Claude-Abo angemeldet.',
      logged_out: 'Abgemeldet. Mit claude /login wieder anmelden.',
      expired: 'Login abgelaufen. Er erneuert sich beim nächsten Claude-Start.',
      rate_limited: 'Zu viele Abfragen. Nächster Versuch in 5 Minuten.',
      unreachable: 'Anthropic ist gerade nicht erreichbar.',
      bad_answer: 'Anthropic hat unerwartet geantwortet.',
      stale: 'Nicht aktuell.'
    },
    scope_problems: {
      no_login: 'TokenScope meldet: nicht angemeldet.',
      logged_out: 'TokenScope meldet: abgemeldet.',
      expired: 'TokenScope meldet: Login abgelaufen.',
      rate_limited: 'TokenScope meldet: Zu viele Abfragen.',
      unreachable: 'TokenScope meldet: Anthropic nicht erreichbar.',
      bad_answer: 'TokenScope meldet: unerwartete Antwort von Anthropic.',
      stale: 'TokenScope meldet: nicht aktuell.'
    },
    stale_since: 'Stand {time}',
    day_bars_label: 'Tokens pro Tag, letzte {n} Tage',
    source: 'Quelle: {source}',
    sources: {
      anthropic: 'Anthropic',
      tokenscope: 'TokenScope'
    },
    today: 'Heute',
    tokens: 'Tokens',
    tokens_hint: 'Eingabe, Ausgabe und Cache',
    tokens_per_day: 'Tokens pro Tag',
    chart_label: 'Tokens pro Tag nach Modell, {from} bis {to}',
    bar_label: '{day}: {total} Tokens. {parts}',
    bar_label_model: '{day}: {value} Tokens mit {model}, {total} insgesamt.',
    of_total: 'von {total} gesamt',
    all_models: 'Alle',
    model_switch_label: 'Modell im Diagramm',
    average_per_day: 'Ø pro Tag',
    peak_day: 'Spitzentag',
    day: 'Tag',
    by_project: 'Nach Projekt',
    other_projects: 'Andere Projekte',
    unknown_project: 'Ohne Ordner',
    by_machine: 'Nach Rechner und Modell',
    machine: 'Rechner',
    total: 'Gesamt',
    models: { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', other: 'Andere' },
    loading: 'Nutzung wird geladen',
    empty_title: 'Noch keine Nutzung',
    empty_hint: 'In diesem Zeitraum hat Claude auf keinem Rechner gearbeitet.',
    quota_empty_title: 'Kein Claude-Konto gefunden',
    quota_empty_hint: 'Melde dich mit claude an, dann steht das Kontingent hier.',
    error_title: 'Nutzung nicht geladen',
    quota_error_title: 'Kontingent nicht geladen',
    error_hint: 'agentd hat nicht rechtzeitig geantwortet.',
    retry: 'Erneut versuchen',
    machines_failed:
      'Ohne {machines}: keine Antwort. Der Rechner ist offline oder sein agentd zu alt. Einstellungen › Rechner › Prüfen sagt, was fehlt.',
    machines_loading: '{machines} lädt noch …'
  },
  nav: {
    label: 'Seiten',
    chat: 'Sessions',
    chats: 'Chats',
    overview: 'Übersicht',
    usage: 'Nutzung',
    settings: 'Einstellungen'
  },
  settings: {
    title: 'Einstellungen',
    open: 'Einstellungen',
    close: 'Einstellungen schließen',
    nav_label: 'Bereiche der Einstellungen',
    back: 'Zurück zu den Einstellungen',
    creator: {
      label: 'Über Bull',
      version: 'Version {version}',
      by: 'von',
      source: 'Quellcode auf GitHub',
      website: 'Webseite'
    },
    worktrees: {
      description:
        'Neue Chats in einem Git-Repo bekommen einen eigenen Worktree mit eigenem Branch. So kommen sich parallele Chats nicht in die Quere.',
      root: 'Ordner für Worktrees',
      root_hint:
        'Leer heißt: „worktrees“ neben dem Ordner mit deinen Projekten, für dev/projects/app also dev/worktrees. Gilt für neue Chats.',
      root_placeholder: 'Neben dem Projektordner',
      example_title: 'So heißt ein neuer Worktree',
      example_prompt: 'Erste Nachricht: „Bitte den Kalender um eine Wochenansicht erweitern“',
      example_slug: 'kalender-wochenansicht-erweitern',
      example_folder_default: 'dev/worktrees/app-{slug}',
      example_folder_in: '{root}/app-{slug}',
      example_branch_value: 'feat/{slug}',
      root_not_full:
        'Bitte einen vollständigen Pfad eintragen, etwa C:\\dev\\worktrees oder /Users/ich/dev/worktrees.',
      example_folder: 'Ordner',
      example_branch: 'Branch',
      example_preview: 'preview',
      example_merge:
        'Über den Branch in der Leiste des Chats: „In preview mergen“ bringt ihn in den Hauptordner, aus dem der Dev-Server läuft.',
      summary_default: 'Neben dem Projekt',
      summary_own: 'Eigener Ordner'
    },
    sections: {
      accounts: 'Konten',
      limits: 'Limits',
      machines: 'Rechner',
      notifications: 'Benachrichtigungen',
      terminal: 'Terminal',
      worktrees: 'Worktrees',
      appearance: 'Darstellung'
    },
    summary: {
      accounts: 'keins aktiv | {count} aktiv | {count} aktiv',
      on: 'An',
      off: 'Aus'
    },
    accounts: {
      description:
        'Die Claude-Konten, die Bull anbietet. Neue Chats starten auf dem Konto mit „Standard“, umschalten geht am Eingabefeld.',
      add: 'Konto hinzufügen',
      loading: 'Konten auf {machine} werden geladen',
      machine_failed:
        '{machine} antwortet nicht. Die Konten dort erscheinen, sobald der Rechner erreichbar ist.',
      retry: 'Erneut versuchen',
      empty: 'Bull bietet hier noch kein Konto an. Füge eins über „Konto hinzufügen“ hinzu.',
      default_badge: 'Standard',
      remove: 'Aus Bull entfernen',
      removed: '{account} aus Bull entfernt. Der Profilordner bleibt erhalten.',
      undo: 'Rückgängig',
      login_state: {
        logged_in: 'Angemeldet',
        logged_out: 'Abgemeldet',
        expired: 'Abgelaufen',
        checking: 'Anmeldung wird geprüft',
        unknown: 'Anmeldung unbekannt'
      },
      relogin: 'Neu anmelden',
      menu: 'Mehr zu {account}',
      make_default: 'Standard für neue Chats',
      color: 'Farbe',
      tones: { a: 'Blau', b: 'Violett', c: 'Türkis', d: 'Pink' },
      login_terminal: 'Im Terminal anmelden'
    },
    add: {
      title: 'Konto hinzufügen',
      description:
        'Bull legt einen neuen Profilordner an und meldet dich darin an. Danach steht das Konto überall zur Wahl.',
      name: 'Name',
      name_hint: 'Kleinbuchstaben, Ziffern und Bindestrich, zum Beispiel kunde-x.',
      name_reuse:
        'Diesen Profilordner gibt es schon, aber ohne Anmeldung. Bull meldet dich darin an.',
      name_problems: {
        empty: 'Gib dem Konto einen Namen.',
        invalid: 'Nur a bis z, 0 bis 9 und Bindestrich, höchstens 32 Zeichen.',
        taken: 'Auf diesem Rechner gibt es schon ein Konto mit diesem Namen.'
      },
      machine: 'Rechner',
      color: 'Farbe',
      folder: 'Profilordner',
      folder_unknown: 'Neben den anderen Profilordnern auf {machine}',
      create: 'Anlegen',
      created: 'Profilordner {folder} angelegt.',
      modes: { new: 'Neu anmelden', existing: 'Schon angemeldet' },
      existing_intro:
        'Ein Profil von Claude Code, das es auf dem Rechner schon gibt, ohne neue Anmeldung.',
      existing_waiting_title: 'Noch keine Antwort',
      existing_waiting:
        'Die Rechner melden ihre Profile noch. Sie erscheinen hier, sobald einer antwortet.',
      existing_empty_title: 'Keine Profile',
      existing_empty:
        'Auf {machine} ist noch kein Profil von Claude Code angemeldet. Melde eins über „Neu anmelden“ an.',
      existing_in_bull: 'Schon in Bull',
      existing_add: 'Hinzufügen',
      existing_add_label: '{account} hinzufügen',
      done: 'Fertig'
    },
    login: {
      title: 'Anmelden: {account}',
      description:
        'Claude Code meldet sich im Browser an. Bull öffnet dafür ein Terminal mit dem Profilordner dieses Kontos.',
      command: 'Befehl für ein eigenes Terminal',
      copy: 'Befehl kopieren',
      fallback_here: 'Oder den Befehl kopieren und {shell} auf diesem @:computer ausführen.',
      fallback_remote: 'Oder den Befehl kopieren und {shell} auf {machine} ausführen.',
      shell: {
        windows: 'in PowerShell',
        macos: 'im Terminal',
        linux: 'im Terminal'
      },
      open_terminal: 'Im Terminal anmelden',
      done: 'Fertig'
    },
    machines: {
      description:
        'Dieser @:computer und die Rechner, die du mit Bull verbunden hast. Auf jedem kann Claude laufen.',
      reachable: 'Erreichbar',
      unreachable: 'Nicht erreichbar',
      checking: 'Wird geprüft',
      accounts: 'keine Konten | 1 Konto | {count} Konten',
      accounts_title: 'Konten in Bull',
      no_accounts_title: 'Noch kein Konto',
      no_accounts: 'Unter „Konten“ schaltest du eines für Bull ein.',
      accounts_failed_title: 'Konten nicht geladen',
      agentd: 'agentd',
      version_unknown_short: 'unbekannt',
      version_unknown:
        'Dieses agentd nennt keine Version. Unter „Prüfen“ spielt Bull ein neues auf.',
      version_unknown_local:
        'Hier läuft noch ein älteres agentd. Bull nimmt das neue, sobald es sich nach dem letzten Tab beendet hat.',
      open_chats: 'Offene Chats',
      answered: 'Zuletzt gemeldet',
      answered_ago: 'vor {age}',
      never: 'noch nicht',
      local: 'Lokal',
      remote: 'SSH-Host',
      remote_as: 'SSH-Host {host}',
      rename: '{machine} umbenennen',
      rename_label: 'Name von {machine}',
      rename_hint: 'Leer lassen für „{name}“.',
      rename_taken: 'So heißt schon ein anderer Rechner.',
      edit: 'Verbindung ändern',
      check: 'Prüfen',
      fix: 'Beheben',
      remove: 'Entfernen',
      remove_title: '{machine} entfernen?',
      remove_body:
        'Bull verbindet sich dann nicht mehr mit {machine}. Auf dem Rechner bleibt alles, wie es ist, auch agentd und die Chats. Über „Weiteren Rechner verbinden“ holst du ihn zurück.',
      remove_blocked:
        'Auf {machine} ist noch ein Chat offen. Schließ ihn zuerst. | Auf {machine} sind noch {count} Chats offen. Schließ sie zuerst.',
      add_card: {
        title: 'Weiteren Rechner verbinden',
        hint: 'Bull prüft die Verbindung, nennt, was fehlt, und richtet agentd dort selbst ein.',
        action: 'Verbinden'
      },
      reasons: {
        ok: {
          title: 'Verbindung steht',
          hint: 'agentd {version} antwortet auf {machine}.'
        },
        offline: {
          title: '{machine} antwortet nicht',
          hint: 'Ist der Rechner an und im selben Netz oder Tailnet? Dort muss ein SSH-Server laufen: unter Windows der Dienst „OpenSSH SSH Server“, am Mac „Entfernte Anmeldung“ in den Systemeinstellungen, unter Linux sshd.'
        },
        auth_failed: {
          title: '{machine} kennt deinen Schlüssel noch nicht',
          hint: "Bull meldet sich ohne Passwort an, mit dem SSH-Schlüssel dieses @:{'computer'}s. Der muss einmal auf den Rechner."
        },
        host_key_changed: {
          title: '{machine} meldet sich mit einem anderen Schlüssel',
          hint: 'Das passiert nach einer Neuinstallation des Systems. Hast du nichts geändert, verbinde dich nicht. Sonst vergiss den alten Schlüssel und prüf erneut.'
        },
        host_key_unknown: {
          title: 'Bull kennt {machine} noch nicht',
          hint: 'SSH war mit diesem Rechner noch nie verbunden. Prüf erneut, dann merkt sich Bull seinen Schlüssel.'
        },
        no_agentd: {
          title: 'agentd fehlt auf {machine}',
          hint: 'Die Verbindung steht. Bull kopiert agentd hinüber, in den Ordner .nexron-chat im Benutzerordner dort.'
        },
        agentd_blocked: {
          title: '{machine} startet agentd nicht',
          hint: 'Unter Windows blockiert oft Smart App Control eine neue, unsignierte Datei, am Mac und unter Linux passt es manchmal nicht zum Prozessor. Ein frisch aufgespieltes agentd hilft oft, sonst muss es dort erlaubt werden.'
        },
        unsupported_system: {
          title: 'Bull kennt das System von {machine} nicht',
          hint: 'Bull verbindet sich mit Windows, macOS und Linux. Dieser Rechner läuft mit etwas anderem oder bietet keine Shell an.'
        }
      },
      assistant: {
        title: 'Weiteren Rechner verbinden',
        edit_title: 'Verbindung zu {machine}',
        edit_description: 'Adresse, Benutzer und Port, mit denen Bull sich per SSH anmeldet.',
        description:
          'Bull meldet sich per SSH bei einem Windows-, Mac- oder Linux-Rechner an und startet Claude dort.',
        suggestions: 'Aus deiner SSH-Konfiguration',
        host: 'Adresse',
        host_hint: 'Name im Netz, IP-Adresse oder ein Host aus ~/.ssh/config.',
        user: 'Benutzer',
        user_hint: 'Leer lassen, wenn er dort gleich heißt oder in ~/.ssh/config steht.',
        port: 'Port',
        port_hint: 'Leer heißt 22.',
        name: 'Name in Bull',
        name_hint: 'Leer heißt wie die Adresse.',
        problems: {
          host_missing: 'Gib eine Adresse ein.',
          host_invalid: 'Die Adresse hat keine Leerzeichen und beginnt nicht mit einem Strich.',
          port: 'Der Port ist eine Zahl von 1 bis 65535.',
          name_taken: 'So heißt schon ein Rechner in Bull.'
        },
        check: 'Verbindung prüfen',
        checking: 'Bull meldet sich bei {machine} an …',
        checking_hint: 'Das dauert höchstens etwa zehn Sekunden.',
        retry: 'Erneut prüfen',
        back: 'Angaben ändern',
        details: 'Was {machine} gemeldet hat',
        use: 'Übernehmen',
        install: 'agentd installieren',
        reinstall: 'agentd neu aufspielen',
        forget_key: 'Alten Schlüssel vergessen',
        forget_key_hint:
          'Öffnet ein Terminal auf diesem @:computer mit dem Befehl. Enter entfernt den alten Schlüssel, danach prüfst du erneut.',
        copy: 'Kopieren',
        copied: 'Zeile kopiert',
        key: {
          login:
            'Öffne ein Terminal zu {machine}. Es kommt als Tab neben deine Chats. Melde dich dort einmal mit dem Passwort an.',
          open_terminal: 'Terminal öffnen',
          paste: 'Füge dort diese Zeile ein und drück Enter:',
          again: 'Schließ das Terminal und prüf die Verbindung erneut.',
          unix: 'Der Rechner ist ein Mac oder Linux-Rechner',
          unix_hint: 'Dann legt die Zeile den Schlüssel in ~/.ssh/authorized_keys ab.',
          admin: 'Das Konto dort ist Administrator',
          admin_hint:
            'Für Administratoren liest Windows den Schlüssel nur aus C:\\ProgramData\\ssh\\administrators_authorized_keys. Die Zeile legt ihn dort ab und setzt die Rechte, die Windows verlangt.',
          none_title: 'Dieser @:computer hat noch keinen SSH-Schlüssel',
          none_hint:
            'Erzeuge einen im Terminal, Enter bei jeder Frage reicht. Danach geht es hier weiter.',
          make: 'Schlüssel erzeugen'
        },
        installing: 'agentd wird auf {machine} eingerichtet',
        steps: {
          checking: 'Prüft, ob dort Chats laufen',
          stopping: 'Beendet das alte agentd',
          copying: 'Kopiert agentd hinüber',
          verifying: 'Startet agentd zur Probe'
        },
        failed_title: 'Einrichten abgebrochen',
        failures: {
          tabs_running:
            'Auf {machine} läuft noch ein Chat. Ein neues agentd würde ihn beenden. Warte, bis er fertig ist, oder schließ ihn. | Auf {machine} laufen noch {count} Chats. Ein neues agentd würde sie beenden. Warte, bis sie fertig sind, oder schließ sie.',
          tabs_unknown:
            'agentd auf {machine} sagt nicht, ob dort noch Chats laufen. Damit keiner abbricht, bleibt es, wie es ist. Versuch es gleich noch einmal.',
          copy_failed:
            'Das Kopieren hat nicht geklappt. Läuft agentd dort noch aus einem anderen Bull?',
          download_failed:
            '{machine} konnte agentd nicht laden. Bull lädt es dort aus dem GitHub-Release dieser Bull-Version. Ist der Rechner im Internet, und ist das Release mit agentd schon veröffentlicht? Ein Entwurf liefert noch nichts aus. Adresse: {url}',
          own_agentd_missing:
            'Bull findet sein eigenes agentd nicht und kann es deshalb nicht hinüberkopieren. Installier Bull neu.',
          invalid: 'Mit diesen Angaben kann Bull sich nicht verbinden.'
        },
        old_kept: 'Die vorige Fassung liegt dort als {file} daneben.',
        done_title: '{machine} ist verbunden',
        done_hint:
          'agentd {version} antwortet. Bei einer neuen Session wählst du den Rechner jetzt aus. Claude braucht dort ein angemeldetes Konto.',
        add_account: 'Konto hinzufügen',
        close: 'Fertig'
      }
    },
    notifications: {
      description: 'Wann Bull dich holt, und wie. Die Glocke oben rechts öffnet dasselbe.'
    },
    terminal: {
      description:
        'Gilt für jedes neue Terminal in Bull, auf diesem @:computer und auf anderen Rechnern.',
      shell: 'Shell',
      shells: {
        auto: 'Automatisch',
        pwsh: 'PowerShell 7',
        powershell: 'Windows PowerShell',
        cmd: 'Eingabeaufforderung',
        bash: 'Git Bash',
        login: 'Standard-Shell'
      },
      shell_hint_label: 'Was ist {shell}?',
      shell_hints: {
        auto: 'Bull nimmt die erste installierte Shell: PowerShell 7, sonst Windows PowerShell. Richtig, wenn du unsicher bist.',
        pwsh: 'Die aktuelle PowerShell, extra installiert. Schnell und gut für Skripte, npm und git.',
        powershell:
          'Die PowerShell 5.1, die bei Windows dabei ist. Für ältere Skripte, die unter PowerShell 7 nicht laufen.',
        cmd: 'Die klassische Windows-Konsole (cmd.exe). Für .bat-Dateien und alte Befehle.',
        bash: 'Die Bash aus Git für Windows. Linux-Befehle wie ls, grep und ./skript.sh, wie auf Mac und Server.',
        login:
          'Bull startet die Shell, die auf diesem Rechner eingestellt ist, auf dem Mac meist zsh. Dieselbe wie im Terminal des Systems.'
      },
      font_size: 'Schriftgröße',
      font_size_value: '{size} px',
      preview: 'Vorschau'
    },
    appearance: {
      description:
        'Hell oder dunkel, und die Farbe, in der Bull akzentuiert. Die Bulle und die Claude-Marke färben sich sofort mit, auch im Browser-Tab und in der Taskleiste. Startmenü und Desktop-Verknüpfung behalten das blaue Icon.',
      theme: 'Design',
      themes: { auto: 'System', light: 'Hell', dark: 'Dunkel' },
      zoom: 'Größe',
      zoom_auto: 'Automatisch',
      zoom_note_auto:
        'Passt sich der Fenstergröße an, gerade {zoom}. {larger} und {smaller} ändern die Größe, {reset} stellt Automatisch wieder her.',
      zoom_note: '{larger} und {smaller} ändern die Größe, {reset} stellt Automatisch wieder her.',
      scheme: 'Farbschema',
      presets: {
        'night-desk': 'Night Desk',
        claude: 'Claude',
        violet: 'Violett',
        teal: 'Türkis',
        forest: 'Wald',
        rose: 'Rose'
      },
      preset_notes: { 'night-desk': 'Standard', claude: 'warm' },
      follows: {
        title: 'Färbt sich mit',
        favicon: 'Favicon',
        taskbar: 'Taskleiste',
        header: 'Kopfzeile',
        claude: 'Claude-Marke',
        tab_title: 'Bull · nexron-chat',
        wordmark: 'Bull',
        model: 'Opus 5.5'
      }
    },
    limits: {
      description:
        'Was passiert, wenn ein Konto voll ist: Der Chat zieht auf ein anderes Konto um, das der Ordner nutzen darf, oder er wartet auf den Reset.',
      move_title: 'Umziehen',
      when_full: 'Wenn ein Konto voll ist',
      modes: { auto: 'Automatisch umziehen', ask: 'Erst fragen', wait: 'Nur warten' },
      modes_short: { auto: 'Umziehen', ask: 'Fragen', wait: 'Warten' },
      suggest_early: 'Schon bei 10 % Rest vorschlagen',
      suggest_early_hint: 'Am Ende des Turns, nicht mittendrin. Der Chat läuft bis dahin normal.',
      order: 'Reihenfolge',
      order_hint: 'Das erste erlaubte Konto mit freiem Kontingent bekommt den Chat.',
      order_item: '{account}, Platz {place} von {count}',
      order_move_hint: 'Ziehen oder {key} zum Verschieben',
      order_moved: '{account} steht jetzt auf Platz {place}.',
      no_accounts: 'Noch kein Konto, das Bull anbietet.',
      rules_title: 'Konten pro Ordner',
      column_folder: 'Ordner',
      column_accounts: 'Darf nutzen',
      column_fallback: 'Wenn alle voll sind',
      column_actions: 'Aktionen',
      fallbacks: {
        move_or_wait: 'umziehen, sonst warten',
        ask_or_wait: 'fragen, sonst warten',
        wait: 'warten'
      },
      other_folders: 'Alle anderen Ordner',
      any_account: 'jedes Konto',
      any_account_ordered: 'jedes Konto, nach Reihenfolge',
      rules_hint:
        'Ohne Regel nimmt Bull das erste freie Konto der Reihenfolge. Eine Regel schränkt das ein, etwa private Projekte nur auf privat.',
      rule_add: 'Regel hinzufügen',
      rule_add_title: 'Regel hinzufügen',
      rule_edit_title: 'Regel ändern',
      rule_description:
        'Chats in diesem Ordner ziehen nur zwischen den gewählten Konten um. Ein Worktree zählt zu seinem Repository.',
      rule_folder: 'Ordner',
      rule_folder_hint:
        'Name des Repositorys, zum Beispiel kramlos. Groß- und Kleinschreibung egal.',
      rule_accounts: 'Darf nutzen',
      rule_accounts_hint: 'Mit nur einem Konto wartet der Chat, statt umzuziehen.',
      rule_problems: {
        empty: 'Gib den Namen des Ordners ein.',
        no_account: 'Wähle mindestens ein Konto.',
        taken: 'Für diesen Ordner gibt es schon eine Regel.'
      },
      rule_menu: 'Mehr zu {folder}',
      rule_edit: 'Ändern',
      rule_remove: 'Entfernen',
      rule_removed: 'Regel für {folder} entfernt.',
      queue_title: 'Warteschlange',
      queue: 'Nachrichten bis zum Reset parken',
      queue_hint: 'Was du an einen vollen Chat schickst, wartet und geht beim Reset raus.',
      notify_queue_sent: 'Melden, wenn eine wartende Nachricht losgeht',
      notify_queue_sent_hint: 'Wie bei „Fertig“: Benachrichtigung, wenn Bull im Hintergrund ist.',
      queue_note:
        'agentd läuft auf jedem Rechner im Hintergrund weiter und sendet auch bei geschlossener App.'
    }
  },
  overview: {
    title: 'Übersicht',
    subtitle: 'Alle Sessions auf allen Rechnern',
    subtitle_single: 'Alle Sessions auf diesem @:computer',
    refresh: 'Übersicht aktualisieren',
    loading: 'Fertige Sessions werden geladen',
    status: { asking: 'Freigabe', working: 'Arbeitet', starting: 'Startet', question: 'Frage' },
    running: 'Laufend',
    done: 'Fertig',
    range_label: 'Zeitraum der fertigen Sessions',
    ranges: { today: 'Heute', week: 'Woche', all: 'Alle' },
    open_label: '{title} öffnen',
    card: {
      finished_at: 'fertig {time}',
      ago: 'vor {age}',
      prompts: '{n} Anfrage | {n} Anfragen',
      context: '{tokens} von {window} Tokens im Kontext',
      started_with: 'Gestartet mit:',
      last_prompt: 'Letzte Anfrage:',
      claude: 'Claude:',
      asks_for: 'Fragt nach:',
      to_chat: 'Zum Chat',
      copy_session_id: '{name}, Session-ID kopieren'
    },
    resume: 'Fortsetzen',
    resume_label: '{title} fortsetzen',
    running_empty_title: 'Gerade läuft nichts',
    running_empty_hint: 'Keine Session arbeitet gerade. Mit {key} startest du eine.',
    running_empty_hint_phone: 'Keine Session arbeitet gerade.',
    done_empty_title: 'Noch nichts fertig',
    done_empty_hint: {
      today: 'Heute ist noch keine Session fertig geworden.',
      week: 'Diese Woche ist noch keine Session fertig geworden.',
      all: 'Abgeschlossene Chats erscheinen hier.'
    },
    done_days: { today: 'Heute', yesterday: 'Gestern' },
    done_all_loaded: 'Alle {n} fertigen Chats geladen',
    done_widen: { week: 'Ganze Woche zeigen', all: 'Alle zeigen' },
    done_error_title: 'Fertige Sessions nicht geladen',
    done_error_hint: 'Dieser Rechner hat nicht rechtzeitig geantwortet.',
    machines_failed: '{machines} nicht erreichbar. Laufende Tabs dort arbeiten weiter.',
    open_chat: 'Chat öffnen',
    remove_matches: '{n} Treffer entfernen',
    done_controls: {
      search_label: 'Fertige Chats durchsuchen',
      search_placeholder: 'Titel, Antwort, Ordner, Konto …',
      clear_search: 'Suche leeren',
      account_label: 'Nach Konto filtern',
      any_account: 'Alle Konten',
      machine_label: 'Nach Rechner filtern',
      any_machine: 'Alle Rechner',
      sort_label: 'Sortieren',
      sorts: {
        newest: 'Neueste zuerst',
        oldest: 'Älteste zuerst',
        title: 'Titel A–Z',
        folder: 'Nach Ordner'
      },
      no_match_title: 'Nichts gefunden',
      no_match_hint: 'Kein fertiger Chat passt zu Suche und Filtern.',
      reset: 'Suche und Filter zurücksetzen'
    },
    activity: {
      title: 'Aktivität',
      summary:
        '{sessions} Sessions und {tokens} Tokens in den letzten 12 Monaten, alle Konten und Rechner',
      summary_single:
        '{sessions} Sessions und {tokens} Tokens in den letzten 12 Monaten, alle Konten',
      error: 'Der Verlauf kam nicht an. Die Übersicht fragt in zwei Minuten erneut.',
      metric_label: 'Was die Felder zählen',
      metrics: { tokens: 'Tokens', sessions: 'Sessions', tools: 'Tools' },
      grid_label: 'Aktivität pro Tag, letzte 12 Monate',
      cell_label: '{day}: {tokens} Tokens, {sessions} Sessions, {tools} Tool-Aufrufe',
      cell_headline: '{tokens} Tokens · {sessions} Sessions',
      cell_tools: '{n} Tool-Aufruf | {n} Tool-Aufrufe',
      legend: {
        tokens: 'Ein Feld ist ein Tag. Je dunkler, desto mehr Tokens.',
        sessions: 'Ein Feld ist ein Tag. Je dunkler, desto mehr Sessions.',
        tools: 'Ein Feld ist ein Tag. Je dunkler, desto mehr Tool-Aufrufe.'
      },
      less: 'Weniger',
      more: 'Mehr',
      active_days: 'Aktive Tage',
      of_days: 'von {n}',
      streak: 'Serie',
      days: '{n} Tag | {n} Tage',
      longest: 'längste: {n} Tag | längste: {n} Tage',
      peak: 'Aktivster Tag',
      peak_values: {
        tokens: '{value} Tokens',
        sessions: '{n} Session | {n} Sessions',
        tools: '{n} Tool-Aufruf | {n} Tool-Aufrufe'
      },
      projects_title: 'Woran du gearbeitet hast',
      recent: 'Letzte {n} Tage, nach Tokens',
      sessions: '{n} Session | {n} Sessions',
      projects_empty: 'Noch keine Projekte',
      error_title: 'Nicht geladen',
      error_hint: 'Sobald der Verlauf ankommt, steht es hier.',
      recent_empty_hint: 'In den letzten {n} Tagen hat Claude hier nichts gemacht.',
      tools_title: 'Tool-Nutzung',
      tool_calls:
        '{n} Aufruf in den letzten {days} Tagen | {n} Aufrufe in den letzten {days} Tagen',
      tools_empty: 'Noch keine Tool-Aufrufe'
    }
  },
  finish: {
    rank: 'Fertig, noch nicht angesehen, Platz {n}',
    new_count: '{n} neu'
  },
  worktree: {
    own: 'Eigener Worktree',
    own_hint:
      'Der Chat arbeitet in einem eigenen Ordner mit eigenem Branch, frisch vom Integrationsbranch. Name und Ordner kommen aus deiner ersten Nachricht.',
    planned_hint: 'Mit deiner ersten Nachricht legt Bull den Worktree an und startet Claude darin.',
    starts_in_folder:
      'Deine nächste Nachricht startet Claude ohne eigenen Worktree direkt im Ordner.',
    refused: {
      no_folder: 'Den Ordner gibt es nicht.',
      no_repository: 'Der Ordner liegt in keinem Git-Repo.',
      not_a_worktree: 'Das ist der Hauptordner, kein Worktree.',
      no_integration: 'Das Repo hat keinen Integrationsbranch (dev, main oder master).',
      relative_root: 'Der Ordner für Worktrees in den Einstellungen ist kein vollständiger Pfad.',
      detached: 'Im Worktree ist kein Branch ausgecheckt.',
      no_free_name: 'Für diesen Branch ist kein Name mehr frei.',
      failed: 'Git ist gescheitert: {message}'
    },
    waits_for_prompt:
      'Der Worktree dieses Chats entsteht mit der ersten Nachricht. Schreib zuerst etwas.',
    pending: 'Eigener Worktree ab der ersten Nachricht',
    badge: 'Worktree',
    menu_label: 'Worktree {branch}',
    menu_title: 'Dieser Chat arbeitet in einem eigenen Worktree',
    merge: 'In preview mergen',
    merging: 'Wird gemergt …',
    remove: 'Worktree entfernen …',
    merged: '{branch} ist in preview: {n} Commit | {branch} ist in preview: {n} Commits',
    nothing_to_merge: 'Nichts zu mergen: preview hat schon alles von {branch}.',
    conflict: 'Konflikt beim Mergen, preview ist unverändert.',
    conflict_with: 'Konflikt mit {branches}, preview ist unverändert.',
    conflict_aborted: 'Der Merge wurde abgebrochen.',
    files: 'Betroffen: {files}.',
    files_and_more: 'Betroffen: {files} und {n} weitere. | Betroffen: {files} und {n} weitere.',
    preview_created: 'preview gab es noch nicht und ist jetzt im Hauptordner angelegt.',
    uncommitted_left:
      'Im Worktree liegen noch nicht committete Änderungen. Gemergt werden nur Commits.',
    main_elsewhere: 'Nicht gemergt: Der Hauptordner steht auf {branch}, nicht auf preview.',
    main_elsewhere_hint: 'Wechsle dort zuerst auf preview, dann noch einmal mergen.',
    main_merging:
      'Nicht gemergt: Im Hauptordner ist noch ein anderer Merge offen. Schließ ihn dort zuerst ab oder brich ihn ab.',
    removable: 'Der Worktree von {branch} lässt sich entfernen.',
    main_dirty:
      'Nicht gemergt: preview fehlt, und der Hauptordner hat nicht committete Änderungen. Bull legt preview erst an, wenn er sauber ist.',
    removed: 'Worktree entfernt, Branch {branch} gelöscht.',
    refused_uncommitted: 'Nicht entfernt: Im Worktree gibt es nicht committete Änderungen.',
    refused_unmerged:
      'Nicht entfernt: {n} Commit ist noch nicht in {integration}. | Nicht entfernt: {n} Commits sind noch nicht in {integration}.',
    refused_in_use: 'Nicht entfernt: In diesem Ordner läuft noch ein anderer Chat.'
  },
  side_column: {
    width_px: '{width} px',
    close_hint: 'Ausblenden'
  },
  preview: {
    label: 'Vorschau',
    show: 'Vorschau einblenden ({key})',
    hide: 'Vorschau ausblenden ({key})',
    toolbar: 'Adresse der Vorschau',
    url_label: 'Adresse',
    url_placeholder: 'localhost:5173/seite',
    url_invalid: 'Das ist keine http- oder https-Adresse.',
    reload: 'Neu laden',
    open_external: 'Im Browser öffnen',
    close: 'Vorschau schließen',
    resize: 'Breite der Vorschau',
    open_in_preview: 'In Vorschau öffnen',
    open_in_preview_short: 'Vorschau',
    frame_title: 'Vorschau von {url}',
    sheet_hint: 'Die Seite aus diesem Chat, so wie der Browser sie zeigt.',
    empty_title: 'Noch keine Seite',
    empty_hint:
      'Nennt Claude eine localhost-Adresse, erscheint die Seite hier. Oder gib oben eine ein.',
    remote_hint: 'localhost ist hier {machine}. Bull lädt {src}.',
    app_only_title: 'Vorschau nur in der Bull-App',
    app_only_hint:
      'Hier im Browser wäre localhost dieses Gerät, nicht der Rechner mit dem Chat. Öffne die Vorschau in Bull auf dem Rechner.',
    no_host_title: '{machine} ist von hier nicht direkt erreichbar',
    no_host_hint:
      'ssh kennt keinen direkten Namen für den Rechner, etwa hinter einem Proxy oder einem weitergeleiteten Port. Öffne die Seite dort im Browser.',
    unreachable_title: 'Seite antwortet nicht',
    unreachable_hint:
      'Unter dieser Adresse läuft gerade nichts. Starte den Dev-Server und lade neu.',
    unreachable_remote_hint:
      'Ein Dev-Server lauscht oft nur auf localhost. Starte ihn auf {machine} mit --host (Vite: npm run dev -- --host) und lade neu.',
    retry: 'Erneut versuchen'
  },
  session_actions: {
    menu: {
      label: 'Mehr zu {title}',
      copy_id: 'Session-ID kopieren',
      clear: 'Chat leeren',
      remove: 'Aus der Liste entfernen',
      delete: 'Endgültig löschen'
    },
    remove_all: 'Alle entfernen',
    removed_one: '„{title}“ entfernt',
    removed_many: '{n} Sessions entfernt',
    removed_hint: 'Der Verlauf bleibt gespeichert und lässt sich über „Neue Session“ fortsetzen.',
    undo: 'Rückgängig',
    cleared: 'Chat geleert. Der alte Verlauf bleibt gespeichert.',
    deleted: '„{title}“ gelöscht',
    refused: {
      session_changed: 'Der Tab hat inzwischen eine andere Session. Es wurde nichts geändert.',
      disconnected:
        'Die Verbindung zu {machine} ist getrennt, Claude läuft dort weiter. Leeren geht wieder, sobald Bull neu verbunden ist.',
      still_running:
        'Claude läuft in diesem Tab noch, Bull verbindet sich gerade neu. Gleich noch einmal versuchen.'
    },
    outdated:
      'agentd auf {machine} kennt das noch nicht. Unter Einstellungen › Rechner › Prüfen spielt Bull ein neues auf.',
    confirm: {
      clear: {
        title: 'Chat leeren?',
        body: 'Claude fängt in „{title}“ von vorn an, wie mit /clear: gleicher Ordner, gleiches Konto, aber ohne den bisherigen Verlauf im Kontext. Der alte Verlauf bleibt gespeichert und lässt sich über „Neue Session“ › „Fortsetzen“ wieder öffnen.',
        confirm: 'Chat leeren',
        note_asking: 'Die offene Freigabe wird dabei abgelehnt.',
        note_working: 'Der laufende Schritt wird dabei abgebrochen.'
      },
      remove: {
        title: '„{title}“ entfernen?',
        body: 'Bull schließt den Tab und nimmt die Session aus der Liste. Der Verlauf bleibt gespeichert, „Neue Session“ › „Fortsetzen“ holt sie zurück.',
        confirm: 'Entfernen'
      },
      stop_and_remove: {
        title: 'Claude arbeitet noch',
        body: 'In „{title}“ läuft gerade ein Schritt. Bull stoppt Claude, schließt den Tab und nimmt die Session aus der Liste. Der Verlauf bleibt gespeichert.',
        confirm: 'Stoppen und entfernen'
      },
      remove_worktree: {
        title: 'Worktree von „{title}“ entfernen?',
        body: 'Bull stoppt Claude, löscht den Ordner {folder} samt Branch und schließt den Tab. Das geht nur, wenn alles committet und im Integrationsbranch angekommen ist. Sonst bleibt alles, wie es ist.',
        confirm: 'Worktree entfernen',
        note_running: 'Der laufende Schritt wird dabei abgebrochen.'
      },
      delete: {
        title: '„{title}“ endgültig löschen?',
        body: 'Bull löscht den Verlauf dieser Session samt Subagents. Rechner: {machine}, Konto: {account}. Das lässt sich nicht rückgängig machen.',
        confirm: 'Löschen',
        note_running: 'Claude wird vorher gestoppt.'
      }
    }
  },
  terminal: {
    desktop_only: 'Das geht nur in der Bull-App am PC: Hier im Browser gibt es kein Terminal.',
    title: 'Terminal',
    tab: 'Terminal',
    new_tab: 'Neuer Tab',
    new: 'Neues Terminal',
    here: 'Terminal hier',
    in_folder: 'Terminal in {folder}',
    on_machine: 'Terminal auf {machine}',
    home: 'Benutzerordner',
    home_on: 'Benutzerordner auf {machine}',
    drawer: 'Terminals unter dem Chat',
    hide_drawer: 'Terminals ausblenden',
    maximize: 'Als eigenen Tab öffnen',
    resize: 'Höhe der Terminals',
    clear: 'Leeren',
    restart: 'Neu starten',
    restart_with: 'Neu starten mit',
    close: 'Terminal schließen',
    menu: 'Mehr zum Terminal',
    key_row: 'Sondertasten',
    phone_subtitle: '{title} · {shell}',
    starting: 'Startet …',
    ssh: 'SSH · {machine}',
    exited: 'Shell beendet (Code {code}). Enter startet eine neue.',
    loading: 'Shell startet …',
    connecting: 'Verbinde mit {machine} …',
    start_failed: 'Die Shell startet nicht',
    retry: 'Erneut versuchen',
    shells_short: {
      pwsh: 'PowerShell',
      powershell: 'PowerShell',
      cmd: 'cmd',
      bash: 'Bash',
      login: 'Shell'
    },
    drawer_tab: '{shell} {number}'
  },
  rewind: {
    open: 'Zurückspulen (Esc Esc)',
    title: 'Zurückspulen',
    description: 'Bis vor welche Nachricht? Alles danach verschwindet aus diesem Chat.',
    points_label: 'Nachricht',
    meta: 'vor {age} · {changes}',
    files_changed: 'keine Änderungen | 1 Datei geändert | {n} Dateien geändert',
    images_only: 'Bild | {n} Bilder',
    scope_title: 'Was soll zurück?',
    scopes: { both: 'Gespräch und Code', conversation: 'Nur Gespräch', code: 'Nur Code' },
    scope_hints: {
      both: '{files} wie vor der Nachricht',
      both_unknown: 'Dateien wie vor der Nachricht',
      both_none: 'Seitdem hat sich keine Datei geändert',
      conversation: 'Dateien bleiben, wie sie sind',
      code: 'Chat bleibt, Dateien zurück'
    },
    files_more: '{count} weitere',
    no_checkpoint: 'Vor dieser Nachricht hat Claude keinen Stand der Dateien gesichert.',
    commands_warning:
      'Was Befehle getan haben (git push, npm install), holt Zurückspulen nicht zurück.',
    cancel: 'Abbrechen',
    submit: 'Zurückspulen',
    empty_title: 'Noch nichts zum Zurückspulen',
    empty_hint:
      'Hier stehen deine Nachrichten seit der letzten Zusammenfassung. Davor geht es nicht zurück.',
    failed: 'Die Nachrichten dieses Chats kamen nicht an.',
    retry: 'Erneut versuchen',
    refused: 'Zurückspulen ging nicht: {reason}',
    refused_code_back: 'Die Dateien sind zurück, der Chat aber nicht. Claude sagt: {reason}'
  },
  review: {
    title: 'Änderungen ansehen',
    description:
      'Wähle Zeilen und schreib einen Kommentar dazu. Die Kommentare gehen gesammelt ins Eingabefeld.',
    all: 'Alle Änderungen',
    open_file: 'Änderungen an {name} ansehen, {added} hinzugefügt, {removed} entfernt',
    show_in_chat: 'Im Chat zeigen',
    show_in_chat_of: '{name} im Chat zeigen',
    files: 'Geänderte Dateien',
    position: '{n} von {count}',
    previous: 'Vorherige Datei ({key})',
    next: 'Nächste Datei ({key})',
    status: { added: 'neu', deleted: 'gelöscht' },
    source: {
      no_repo:
        'Kein git-Repository. Du siehst die Änderungen, die Claude in diesem Chat gemacht hat.',
      no_git:
        'Auf diesem Rechner fehlt git. Du siehst die Änderungen, die Claude in diesem Chat gemacht hat.',
      unchanged:
        'Die Datei gleicht dem letzten Commit. Du siehst die Änderungen, die Claude in diesem Chat gemacht hat.',
      ignored:
        'git ignoriert diese Datei. Du siehst die Änderungen, die Claude in diesem Chat gemacht hat.',
      missing:
        'Die Datei gibt es nicht mehr. Du siehst die Änderungen, die Claude in diesem Chat gemacht hat.',
      too_big:
        'Die Datei ist zu groß für einen Vergleich. Du siehst die Änderungen, die Claude in diesem Chat gemacht hat.',
      failed:
        'Der Rechner hat den Stand der Datei nicht geschickt. Du siehst die Änderungen aus dem Chat.'
    },
    truncated: 'Die Datei ist sehr groß. Du siehst nur die Zeilen um die Änderungen.',
    binary_title: 'Binärdatei',
    binary_hint: 'Diese Datei hat keine Zeilen, die sich zeigen lassen.',
    nothing_title: 'Keine Änderungen',
    nothing_hint: 'Weder git noch dieser Chat haben Zeilen zu dieser Datei.',
    nothing_hint_unchanged:
      'Die Datei gleicht dem letzten Commit, und der Chat hat keine Zeilen dazu.',
    diff_label: 'Änderungen in {path}',
    diff_hint:
      'Pfeiltasten wählen eine Zeile, mit Umschalt mehrere. Eingabe schreibt einen Kommentar, Esc hebt die Auswahl auf. J und K wechseln die Datei.',
    chosen: '{reference} gewählt: {text}',
    unfold: '1 unveränderte Zeile zeigen | {n} unveränderte Zeilen zeigen',
    line_added: 'Hinzugefügt, Zeile {line}:',
    line_removed: 'Entfernt, Zeile {line}:',
    line_kept: 'Zeile {line}:',
    old_reference: '{reference} (vorher)',
    comment_on: 'Kommentieren',
    comment_label: 'Kommentar zu {reference}',
    comment_placeholder: 'Was soll Claude hier ändern?',
    comment_cancel: 'Abbrechen',
    comment_add: 'Hinzufügen',
    comment_remove: 'Kommentar zu {reference} entfernen',
    comment_count: 'Keine Kommentare | 1 Kommentar | {n} Kommentare',
    insert: 'Ins Eingabefeld'
  },
  context: {
    title: 'Kontext',
    description: 'Was den Kontext füllt und wie viel noch frei ist.',
    total: '{tokens} von {window} · {percent} %',
    groups: {
      system_prompt: 'System-Prompt',
      tools: 'Tools',
      mcp: 'MCP-Tools',
      memory: 'CLAUDE.md und Regeln',
      skills: 'Skills',
      agents: 'Agents',
      messages: 'Nachrichten',
      other: 'Sonstiges'
    },
    buffer: 'Reserve fürs Zusammenfassen',
    free: 'frei',
    loaded: 'Geladen',
    loaded_folder: '{path} · {count} Dateien',
    loaded_skills: 'Skills · 1 Beschreibung | Skills · {n} Beschreibungen',
    failed: 'Die Aufteilung kam nicht an.',
    retry: 'Erneut versuchen',
    compact_title: 'Jetzt zusammenfassen',
    compact_placeholder: 'Worauf achten? z. B. „Entscheidungen zum Header behalten“',
    compact_submit: 'Zusammenfassen',
    hint_left: 'Noch {percent} bis Claude den Verlauf von selbst zusammenfasst.',
    hint_action: 'Jetzt zusammenfassen',
    open: 'Kontext ansehen'
  },
  errors: {
    unexpected: 'Etwas ist schiefgelaufen: {message}',
    unreachable:
      '{machine} ist nicht erreichbar. Versuch es noch einmal, sobald der Rechner wieder online ist.'
  }
}

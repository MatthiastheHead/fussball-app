import React, { useEffect, useState } from 'react';

const download = (data, prefix) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function BackupPanel({ request, canExport, canImport, onImported }) {
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [options, setOptions] = useState(null);
  const [exportScopes, setExportScopes] = useState([]);
  const [importScopes, setImportScopes] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const jsonRequest = async (path, body) => {
    const response = await request(path, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Die Sicherungsfunktion konnte nicht ausgeführt werden.');
    return data;
  };
  useEffect(() => {
    let mounted = true;
    jsonRequest('backup/options').then(data => {
      if (mounted) { setOptions(data); setExportScopes(data.exportScopes); }
    }).catch(err => { if (mounted) setError(err.message); });
    return () => { mounted = false; };
  }, []);
  const run = async action => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (err) { setError(err.message || 'Die Sicherung konnte nicht verarbeitet werden.'); }
    finally { setBusy(false); }
  };
  const clearPreview = () => { setPreview(null); setRecoverySaved(false); };
  const toggle = (selected, key) => selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key];
  return <section className="backup-panel">
    <p>Sichere Mannschaftsdaten als JSON-Datei und stelle ausgewählte Bereiche daraus wieder her.</p>
    <p>Die vollständige, verschlüsselte Sicherung enthält alle gespeicherten App-Inhalte einschließlich Benutzerkonten, Passwortdaten, Rollen, Rechten, Authenticator-Daten und gelöschten Buchungen. Sie steht dem Hauptadmin und ausdrücklich dafür freigegebenen Benutzern zur Verfügung. Admins und freigegebene Benutzer können die erlaubten Mannschaftsbereiche sichern und importieren.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    {notice && <p className="login-notice" role="status">{notice}</p>}
    {!options && !error && <p>Sicherungsoptionen werden geladen…</p>}
    {options && <>
      {options.canFullBackup && <section className="cash-entry-section">
        <h2>Alles vollständig sichern</h2>
        <p>Enthält Spielerinnen und Trainer, alle Trainings und Notizen, Checklisten, To-dos, Einstellungen, die gesamte Kasse, Benutzerkonten, Sicherheitsdaten und den Anmeldeverlauf.</p>
        <p>Bewahre dein Sicherungspasswort getrennt von der Datei auf. Ohne dieses Passwort lässt sie sich nicht wiederherstellen. Die Sicherheitsdaten benötigen beim Import dieselbe Serverkonfiguration. Aktive Anmeldungen werden nicht gesichert.</p>
        <label className="labeled-field"><span>Sicherungspasswort, mindestens 12 Zeichen</span><input type="password" autoComplete="new-password" maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        <label className="labeled-field"><span>Sicherungspasswort wiederholen</span><input type="password" autoComplete="new-password" maxLength={256} value={passwordRepeat} disabled={busy} onChange={event => setPasswordRepeat(event.target.value)} /></label>
        <button type="button" className="btn-save-players" disabled={busy || password.length < 12 || password !== passwordRepeat} onClick={() => run(async () => {
          download(await jsonRequest('backup/full/export', { password }), 'Fussball-App-Komplettsicherung');
          setPassword(''); setPasswordRepeat(''); setNotice('Der Download deiner verschlüsselten Komplettsicherung wurde gestartet.');
        })}>Vollständige Sicherung herunterladen</button>
      </section>}
      {canExport && <section className="cash-entry-section">
        <h2>Einzelne Mannschaftsbereiche sichern</h2>
        <p>Diese Dateien sind unverschlüsselt und enthalten keine Benutzerkonten oder Sicherheitsdaten. Bewahre sie geschützt auf.</p>
        <div className="backup-scopes">{options.exportScopes.map(key => <label key={key}>
          <input type="checkbox" checked={exportScopes.includes(key)} disabled={busy}
            onChange={() => setExportScopes(value => toggle(value, key))} />{options.labels[key]}
        </label>)}</div>
        {exportScopes.includes('teamCash') && <p>{options.includesDeletedCash
          ? 'Die Kassensicherung enthält auch gelöschte Buchungen.'
          : 'Die Kassensicherung enthält nur sichtbare Buchungen. Gelöschte Einträge bleiben geschützt.'}</p>}
        <button type="button" className="btn-save-players" disabled={busy || !exportScopes.length} onClick={() => run(async () => {
          download(await jsonRequest('backup/export', { scopes: exportScopes }), 'Fussball-App-Sicherung');
          setNotice('Der Download deiner Sicherung wurde gestartet.');
        })}>Sicherung herunterladen</button>
      </section>}
      {canImport && <section className="cash-entry-section">
        <h2>Sicherung importieren</h2>
        <p>Der Import ersetzt die ausgewählten Bereiche vollständig. Nicht ausgewählte Bereiche bleiben erhalten. Eine leere Liste leert den jeweiligen Bereich.</p>
        <p>Spielerinnen und Grundeinstellungen können nur allgemeine Admins importieren. Für die Kasse brauchst du mindestens Kassenadminrechte; ein abweichender Startbestand bleibt allgemeinen Admins vorbehalten. Bereits gelöschte Kassenbuchungen bleiben intern erhalten.</p>
        <label className="labeled-field"><span>Sicherungsdatei auswählen (JSON, höchstens 96 MB)</span>
          <input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
            const selected = event.target.files?.[0];
            setFile(null); setImportPassword(''); setImportScopes([]); clearPreview();
            if (!selected) return;
            run(async () => {
              if (selected.size > 96 * 1024 * 1024) throw new Error('Die Datei darf höchstens 96 MB groß sein.');
              const backup = JSON.parse(await selected.text());
              if (backup?.format === 'fussball-app-encrypted-backup' && backup.schemaVersion === 1) {
                if (!options.canFullBackup) throw new Error('Für vollständige Sicherungen fehlt dir die Freigabe des Hauptadmins.');
                setFile(backup); return;
              }
              if (backup?.format !== 'fussball-app-backup' || backup.schemaVersion !== 1 || !backup.data || typeof backup.data !== 'object') throw new Error('Bitte eine passende Fußball-App-Sicherung auswählen.');
              setFile(backup);
              setImportScopes(Object.keys(backup.data).filter(key => options.importScopes.includes(key)));
            });
          }} />
        </label>
        {file && <>
          {file.data ? <><p>Sicherung vom {new Date(file.exportedAt).toLocaleString('de-DE')} · Erstellt von {String(file.exportedBy || 'Unbekannt')}</p>
          <div className="backup-scopes">{Object.keys(file.data).filter(key => key !== 'receipts').map(key => <label key={key}>
            <input type="checkbox" checked={importScopes.includes(key)} disabled={busy || !options.importScopes.includes(key)}
              onChange={() => { setImportScopes(value => toggle(value, key)); clearPreview(); }} />
            {options.labels[key] || key}{!options.importScopes.includes(key) ? ' (keine Importberechtigung)' : ''}
          </label>)}</div></> : <>
            <p>Vollständige Wiederherstellung: Alle Inhalte, Konten, Passwörter und Rechte werden auf den gesicherten Stand zurückgesetzt. Auch der Verlauf gelöschter Buchungen wird ersetzt. Danach müssen sich alle Benutzer neu anmelden.</p>
            <label className="labeled-field"><span>Passwort dieser Sicherung</span><input type="password" autoComplete="off" value={importPassword} disabled={busy} onChange={event => { setImportPassword(event.target.value); clearPreview(); }} /></label>
          </>}
          <button type="button" className="btn-edit" disabled={busy || (file.data ? !importScopes.length : importPassword.length < 12)} onClick={() => run(async () => {
            clearPreview();
            setPreview(await jsonRequest(file.data ? 'backup/preview' : 'backup/full/preview', { backup: file, scopes: importScopes, password: importPassword }));
          })}>Datei prüfen und Import anzeigen</button>
        </>}
        {preview && <div className="backup-preview">
          <h3>Diese Bereiche werden ersetzt</h3>
          <p>Eine Kassensicherung enthält die zugehörigen Belege. Bei älteren Dateien ohne Belege bleiben gespeicherte Belegdateien erhalten. Sichtbar sind nur Belege zu vorhandenen und für dich freigegebenen Buchungen.</p>
          {preview.preservedTasks && <p>Diese ältere Sicherung enthält keine To-dos. Deine aktuell gespeicherten To-dos bleiben erhalten.</p>}
          <ul>{preview.summary.map(row => <li key={row.key}>{row.label}: {row.before} Datensätze vorhanden, {row.after} nach dem Import</li>)}</ul>
          {preview.full && <p>Die Sicherung vor dem Import ist mit demselben Passwort verschlüsselt wie die ausgewählte Datei.</p>}
          <p>Bei der Kasse wird ein Kassenbestand als Datensatz gezählt. Die Prüfung gilt fünf Minuten.</p>
          <button type="button" className="btn-edit" disabled={busy} onClick={() => {
            download(preview.recoveryBackup, 'Fussball-App-Vor-Import'); setRecoverySaved(true);
          }}>Aktuellen Stand vor dem Import herunterladen</button>
          <button type="button" className="cash-delete-button" disabled={busy || !recoverySaved} onClick={() => run(async () => {
            if (!window.confirm('Hast du die Sicherung des aktuellen Stands gespeichert? Die ausgewählten Bereiche werden jetzt durch die geprüfte Datei ersetzt. Import ausführen?')) return;
            const token = preview.token;
            clearPreview();
            const result = await jsonRequest('backup/import', { token, confirm: true });
            setFile(null); setImportScopes([]);
            setNotice(`Import erfolgreich am ${new Date(result.importedAt).toLocaleString('de-DE')} durch ${result.importedBy}.`);
            setImportPassword('');
            try { await onImported(result.full); } catch { setNotice('Import erfolgreich. Bitte die App neu laden, um den wiederhergestellten Stand zu sehen.'); }
          })}>Ausgewählte Bereiche jetzt ersetzen</button>
        </div>}
      </section>}
    </>}
  </section>;
}

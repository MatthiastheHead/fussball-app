export function validateCashFiles(files) {
  if (files.length > 10) throw new Error('Höchstens zehn Belege je Buchung.');
  for (const file of files) {
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: höchstens 10 MB je Datei.`);
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error(`${file.name}: Bitte JPEG, PNG, WebP oder PDF auswählen.`);
  }
}

export async function uploadCashReceipt(request, transactionId, file) {
  if (!transactionId || transactionId === 'unavailable') throw new Error('Die gespeicherte Buchung konnte nicht zugeordnet werden. Bitte die Kasse aktualisieren.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
  const response = await request(`team-cash/transactions/${transactionId}/receipts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, data }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Der Beleg konnte nicht gespeichert werden.');
  }
}

// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Tests end-to-end en MODE DÉMO.
 *
 * On force le mode démo en remplaçant js/config.js par une config vide (aucune
 * clé Supabase), et on coupe les CDN externes pour rester déterministe et
 * hors-ligne. L'application gère l'absence de Chart.js / jsPDF (dégradé).
 */
async function setupDemo(page) {
  await page.route('**/js/config.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'window.APP_CONFIG = {};' }));
  await page.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
}

async function loginAdmin(page) {
  await page.goto('/index.html');
  await expect(page.locator('#loginBtn')).toBeVisible();
  // En mode démo, les identifiants admin sont pré-remplis.
  await page.locator('#loginBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await setupDemo(page);
});

test('connexion admin puis navigation entre les 5 onglets sans écran blanc', async ({ page }) => {
  await loginAdmin(page);
  const tabs = ['sheet', 'recap', 'children', 'stats', 'employees'];
  for (const v of tabs) {
    await page.locator(`.navbtn[data-v="${v}"]`).click();
    // Le contenu se rend et aucun message fatal n'apparaît.
    await expect(page.locator('#app')).not.toBeEmpty();
    await expect(page.locator('#app .msg.error strong')).toHaveCount(0);
  }
});

test('feuille du mois : modifier l’horaire réel met à jour le total presté', async ({ page }) => {
  await loginAdmin(page);
  await page.locator('.navbtn[data-v="sheet"]').click();
  await expect(page.locator('#tWorked')).toBeVisible();

  const before = await page.locator('#tWorked').textContent();
  // Premier sélecteur d'heure de fin réelle modifiable → on l'allonge à 21:00.
  const endSel = page.locator('select[data-k="end_time"]:not([disabled])').first();
  await endSel.selectOption('21:00');

  await expect(page.locator('#tWorked')).not.toHaveText(before || '');
});

test('enfants : ajouter un enfant puis cocher une présence incrémente son total', async ({ page }) => {
  await loginAdmin(page);
  await page.locator('.navbtn[data-v="children"]').click();

  await page.locator('#kFirst').fill('Testprenom');
  await page.locator('#kLast').fill('Zztest');
  await page.locator('#kAdd').click();

  const row = page.locator('table.attend tbody tr', { hasText: 'Testprenom' });
  await expect(row).toHaveCount(1);
  // Un enfant neuf a 0 présence ; on coche le premier jour.
  await row.locator('input.pres').first().check();
  await expect(row.locator('.kidtot strong')).toHaveText('1');
});

test('sauvegarde : l’export JSON déclenche un téléchargement', async ({ page }) => {
  await loginAdmin(page);
  await page.locator('.navbtn[data-v="employees"]').click();
  await expect(page.locator('#expJson')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#expJson').click(),
  ]);
  expect(download.suggestedFilename()).toContain('edd-sauvegarde');
});

test('règle métier : le mois précédent est bloqué en janvier 2026', async ({ page }) => {
  await loginAdmin(page);
  await page.locator('.navbtn[data-v="sheet"]').click();
  const prev = page.locator('#prevM');
  // On recule jusqu'à ce que le bouton se désactive (janvier 2026 = premier mois).
  for (let i = 0; i < 60; i++) {
    if (await prev.isDisabled()) break;
    await prev.click();
  }
  await expect(prev).toBeDisabled();
});

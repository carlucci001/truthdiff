async (page) => {
await page.waitForTimeout(5000);
await page.getByRole('heading', {name:'Scan result', exact:true}).evaluate(el => el.scrollIntoView({behavior:'smooth', block:'start'}));
await page.waitForTimeout(6500);
await page.getByRole('button', {name:'deployment-runbook proven', exact:true}).click();
await page.getByRole('heading', {name:'Documents to inspect 8', exact:true}).evaluate(el => el.scrollIntoView({behavior:'smooth', block:'start'}));
await page.waitForTimeout(8000);
await page.getByRole('button', {name:'billing-recovery review', exact:true}).click();
await page.waitForTimeout(6500);
await page.getByText('Optional visual of changed files connected to documents', {exact:true}).evaluate(el => el.scrollIntoView({behavior:'smooth', block:'start'}));
await page.waitForTimeout(7000);
await page.evaluate(() => window.scrollTo({top:0, behavior:'smooth'}));
await page.waitForTimeout(6000);
}

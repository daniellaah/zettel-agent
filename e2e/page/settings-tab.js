// Renders the settings tab, reads its structure, and closes it without changing anything.
app.setting.open();
app.setting.openTabById("zettel-agent");
await new Promise((r) => setTimeout(r, 400));
const el = app.setting.activeTab.containerEl;
const names = [...el.querySelectorAll(".setting-item-name")].map((n) => n.textContent);
const providers = [...el.querySelector("select").options].map((o) => o.value);
app.setting.close();
return { names, providers };

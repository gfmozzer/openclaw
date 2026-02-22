import { html } from "lit";
import { t } from "../../i18n/index.ts";

export function renderFaqView() {
  return html`
    <section class="card">
      <div class="card-title">${t("faqPage.title")}</div>
      <div class="card-sub">${t("faqPage.subtitle")}</div>
    </section>

    ${item(t("faqPage.whatsAppQ"), t("faqPage.whatsAppA"))}
    ${item(t("faqPage.telegramQ"), t("faqPage.telegramA"))}
    ${item(t("faqPage.workerQ"), t("faqPage.workerA"))}
    ${item(t("faqPage.stackQ"), t("faqPage.stackA"))}
    ${item(t("faqPage.authQ"), t("faqPage.authA"))}
    ${item(t("faqPage.policyQ"), t("faqPage.policyA"))}

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("faqPage.overridesSectionTitle")}</div>
      <div class="card-sub">${t("faqPage.overridesSectionSub")}</div>
    </section>
    ${item(t("faqPage.frontdoorQ"), t("faqPage.frontdoorA"))}
    ${item(t("faqPage.overrideFallbackQ"), t("faqPage.overrideFallbackA"))}
    ${item(t("faqPage.skillAllowlistQ"), t("faqPage.skillAllowlistA"))}
    ${item(t("faqPage.economyModeQ"), t("faqPage.economyModeA"))}
    ${item(t("faqPage.providerCapabilityQ"), t("faqPage.providerCapabilityA"))}

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("faqPage.statusSectionTitle")}</div>
      <div class="card-sub">${t("faqPage.statusSectionSub")}</div>
    </section>
    ${item(t("faqPage.frontendStatusQ"), t("faqPage.frontendStatusA"))}
    ${item(t("faqPage.roadmapSourceQ"), t("faqPage.roadmapSourceA"))}
    ${item(t("faqPage.completedBaselineQ"), t("faqPage.completedBaselineA"))}
  `;
}

function item(question: string, answer: string) {
  return html`
    <section class="card" style="margin-top: 14px;">
      <div class="card-title">${question}</div>
      <div class="card-sub">${answer}</div>
    </section>
  `;
}

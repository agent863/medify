import type { Metadata } from "next";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../chatgpt-auth";
import { getAdminUser, readSiteContent } from "../../server-content";
import TrafficAcceptanceClient from "./TrafficAcceptanceClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Medify 3D Hospital 三樓交通驗收",
};

export default async function TrafficAcceptancePage() {
  const signedIn = await requireChatGPTUser("/admin/qa");
  const admin = await getAdminUser();
  if (!admin)
    return (
      <main className="admin-access-denied">
        <section>
          <p>MEDIFY TRAFFIC QA</p>
          <h1>此帳號沒有驗收權限</h1>
          <span>{signedIn.email}</span>
          <a href={chatGPTSignOutPath("/admin/qa")}>改用其他 ChatGPT 帳號登入</a>
        </section>
      </main>
    );

  const content = await readSiteContent();
  return (
    <TrafficAcceptanceClient
      initialContent={content}
      displayName={admin.displayName}
      email={admin.email}
      signOutPath={chatGPTSignOutPath("/admin/qa")}
    />
  );
}

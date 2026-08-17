import type { Metadata } from "next";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import { getAdminUser, readSiteContent } from "../server-content";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Medify 3D Hospital 後台",
};

export default async function AdminPage() {
  const signedIn = await requireChatGPTUser("/admin");
  const admin = await getAdminUser();
  if (!admin)
    return (
      <main className="admin-access-denied">
        <section>
          <p>MEDIFY CONTENT STUDIO</p>
          <h1>此帳號沒有後台權限</h1>
          <span>{signedIn.email}</span>
          <a href={chatGPTSignOutPath("/admin")}>改用其他 ChatGPT 帳號登入</a>
        </section>
      </main>
    );
  const content = await readSiteContent();
  return (
    <AdminClient
      initialContent={content}
      displayName={admin.displayName}
      email={admin.email}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}

export async function sendViberMessage(
  token: string,
  phone: string,
  text: string,
  senderName = "Zipper"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("https://chatapi.viber.com/pa/send_message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Viber-Auth-Token": token,
      },
      body: JSON.stringify({
        receiver: phone.replace(/\D/g, ""),
        min_api_version: 1,
        sender: { name: senderName },
        type: "text",
        text,
      }),
    });
    const d = await r.json();
    if (d.status === 0) return { ok: true };
    return { ok: false, error: d.status_message ?? `Viber status ${d.status}` };
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }
}

from playwright.sync_api import sync_playwright, expect
exec(open('/home/claude/scripts/hub_e2e.py').read().split("with sync_playwright() as pw:")[0])
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome"); c=b.new_context(viewport={"width":1440,"height":900}); setup(c); p=c.new_page(); attach(p)
    p.goto(BASE+"/connexion"); p.get_by_label("Adresse e-mail").fill("camille@exemple.fr"); p.get_by_label("Mot de passe").fill("demo1234"); p.get_by_role("button", name="Se connecter", exact=True).click()
    p.wait_for_url(BASE+"/"); p.goto(BASE+"/assistant"); expect(p.get_by_text("IA connectée")).to_be_visible()
    box=p.get_by_label("Votre message"); box.fill("Explique-moi les volcans"); box.press("Enter")
    seen=[]
    for i in range(14):
        p.wait_for_timeout(350)
        d=p.locator(".bubble--streaming .bubble__text")
        seen.append(d.inner_text() if d.count() else "-")
        if i==5: p.screenshot(path="/home/claude/atrium/replica/clone-screens/S06-streaming.png")
    print("\n".join(f"{i*0.35:.2f}s  {s}" for i,s in enumerate(seen)))
    expect(p.locator(".chat .bubble--assistant .bubble__text").last).to_have_text("Réponse de Gemini à : Explique-moi les volcans", timeout=8000)
    expect(p.locator(".bubble--streaming")).to_have_count(0)
    print("final OK; console errors:", errors or "none")
    b.close()

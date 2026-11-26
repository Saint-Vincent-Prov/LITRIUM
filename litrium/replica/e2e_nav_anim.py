from playwright.sync_api import sync_playwright, expect
exec(open('/home/claude/scripts/hub_e2e.py').read().split("with sync_playwright() as pw:")[0])
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome"); c=b.new_context(viewport={"width":1440,"height":900}); setup(c); p=c.new_page(); attach(p)
    p.goto(BASE+"/connexion"); p.get_by_label("Adresse e-mail").fill("camille@exemple.fr"); p.get_by_label("Mot de passe").fill("demo1234"); p.get_by_role("button", name="Se connecter", exact=True).click()
    p.wait_for_url(BASE+"/"); p.wait_for_timeout(1200)
    nav=p.locator(".bottomnav"); box=nav.bounding_box(); clip={"x":box["x"]-20,"y":box["y"]-20,"width":box["width"]+40,"height":box["height"]+40}
    def lens_vs_active():
        return p.evaluate("""()=>{const l=document.querySelector('.bottomnav__lens').getBoundingClientRect();const a=document.querySelector('.bottomnav a[aria-current=page]').getBoundingClientRect();return [Math.round(l.left-a.left),Math.round(l.width-a.width)]}""")
    print("at rest on Accueil, lens-vs-tab offset:", lens_vs_active())
    p.screenshot(path="/tmp/nav0.png", clip=clip)
    p.get_by_role("link", name="Notes").hover(); p.wait_for_timeout(350)
    print("hover transform on Notes icon:", p.evaluate("getComputedStyle(document.querySelectorAll('.bottomnav .navicon')[6]).transform"))
    p.screenshot(path="/tmp/nav-hover.png", clip=clip)
    p.get_by_role("link", name="Notes").click()
    shots=[]
    for i,t in enumerate([60,120,200]):
        p.wait_for_timeout(t if i==0 else t-[60,120,200][i-1]); p.screenshot(path=f"/tmp/nav-move{i}.png", clip=clip)
    print("moving class during slide:", p.evaluate("document.querySelector('.bottomnav__lens').className"))
    p.wait_for_timeout(600); print("after slide, lens-vs-tab offset:", lens_vs_active())
    p.goto(BASE+"/parametres"); p.wait_for_timeout(600)
    print("on Réglages (no tab): lens hidden =", "is-hidden" in p.evaluate("document.querySelector('.bottomnav__lens').className"))
    m=b.new_context(viewport={"width":390,"height":844}, storage_state=c.storage_state()); setup(m); mp=m.new_page()
    mp.goto(BASE+"/agenda"); mp.wait_for_timeout(800)
    print("mobile lens-vs-tab:", mp.evaluate("""()=>{const l=document.querySelector('.bottomnav__lens').getBoundingClientRect();const a=document.querySelector('.bottomnav a[aria-current=page]').getBoundingClientRect();return [Math.round(l.left-a.left),Math.round(l.width-a.width)]}"""))
    print("console errors:", errors or "none"); b.close()

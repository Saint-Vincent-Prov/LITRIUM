import re, json
from playwright.sync_api import sync_playwright, expect
exec(open('/home/claude/scripts/hub_e2e.py').read().split("with sync_playwright() as pw:")[0])
OUT="/home/claude/atrium/replica/clone-screens"
B1="http://localhost:4173"; B2="http://localhost:4174"
def signout(p, base):
    p.goto(base+"/"); p.get_by_role("button", name="Mon compte").click(); p.get_by_role("menuitem", name="Se déconnecter").click()
    p.get_by_role("heading", name="Bon retour parmi nous").wait_for()
leaks=[]
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx=b.new_context(viewport={"width":1440,"height":900}, geolocation={"latitude":43.3,"longitude":5.37}, permissions=["geolocation"])
    setup(ctx); p=ctx.new_page(); attach(p)
    p.on("request", lambda r: ("gk-test" in (r.headers.get("x-api-key","")+ (r.post_data or ""))) and leaks.append(r.url))
    # 1. first launch -> create account screen
    p.goto(B1+"/"); expect(p).to_have_url(re.compile("/bienvenue")); expect(p.get_by_role("heading", name="Créez votre compte")).to_be_visible()
    p.wait_for_timeout(300); p.screenshot(path=f"{OUT}/S00-signup.png")
    # 2. validation
    p.get_by_role("button", name="Créer mon compte").click()
    expect(p.get_by_text("Indiquez votre nom.")).to_be_visible(); expect(p.get_by_text("Au moins 8 caractères.")).to_be_visible()
    expect(p.get_by_label("Nom", exact=True)).to_be_focused()
    p.screenshot(path=f"{OUT}/S00-signup-errors.png")
    p.get_by_label("Nom", exact=True).fill("Marie Lemaire"); p.get_by_label("Adresse e-mail").fill("Marie@Exemple.fr"); p.get_by_label("Mot de passe").fill("motdepasse1")
    p.get_by_role("button", name="Afficher").click(); expect(p.get_by_label("Mot de passe")).to_have_attribute("type","text")
    p.get_by_role("button", name="Créer mon compte").click()
    expect(p.get_by_text("Bienvenue, Marie")).to_be_visible(); expect(p.get_by_role("heading", name=re.compile("Marie"))).to_be_visible()
    expect(p.locator(".h-not")).to_contain_text("Bienvenue sur Litrium"); expect(p.locator(".h-msg")).to_contain_text("Aucune conversation")
    # 3. sign out / sign in tab
    signout(p,B1); p.screenshot(path=f"{OUT}/S01-login.png")
    p.get_by_label("Adresse e-mail").fill("inconnu@exemple.fr"); p.get_by_label("Mot de passe").fill("xxxxxxxx"); p.get_by_role("button", name="Se connecter", exact=True).click()
    expect(p.get_by_text("Aucun compte avec cette adresse.")).to_be_visible()
    p.get_by_label("Adresse e-mail").fill("marie@exemple.fr"); p.get_by_label("Mot de passe").fill("mauvais123"); p.get_by_role("button", name="Se connecter", exact=True).click()
    expect(p.get_by_text("Mot de passe incorrect.")).to_be_visible()
    p.get_by_label("Mot de passe").fill("motdepasse1"); p.get_by_role("button", name="Se connecter", exact=True).click()
    expect(p.get_by_text("Vous êtes connecté·e.")).to_be_visible()
    # 4. duplicate signup
    signout(p,B1); p.get_by_role("link", name="Créer un compte").first.click()
    p.get_by_label("Nom", exact=True).fill("Autre"); p.get_by_label("Adresse e-mail").fill("marie@exemple.fr"); p.get_by_label("Mot de passe").fill("motdepasse2")
    p.get_by_role("button", name="Créer mon compte").click(); expect(p.get_by_text("Un compte existe déjà")).to_be_visible()
    p.locator(".form-error").get_by_role("link", name="Se connecter").click(); expect(p.get_by_label("Adresse e-mail")).to_have_value("marie@exemple.fr")
    # 5. Google (demo mode)
    p.get_by_role("button", name="Continuer avec Google").click()
    expect(p.get_by_role("dialog")).to_contain_text("pas encore configurée"); p.screenshot(path=f"{OUT}/S00-google-demo.png")
    p.get_by_label("Nom", exact=True).fill("Paul Martin"); p.get_by_label("E-mail du compte Google").fill("paul.martin@gmail.com"); p.get_by_role("button", name="Continuer", exact=True).click()
    expect(p.get_by_text("Bienvenue, Paul")).to_be_visible()
    p.goto(B1+"/parametres"); expect(p.get_by_text("Connecté avec Google")).to_be_visible()
    signout(p,B1); p.get_by_role("button", name="Continuer avec Google").click()
    p.get_by_label("E-mail du compte Google").fill("paul.martin@gmail.com"); p.get_by_role("button", name="Continuer", exact=True).click()
    expect(p.get_by_text("Vous êtes connecté·e.")).to_be_visible()
    # 6. Apple (demo) + email login on google-created account
    signout(p,B1); p.get_by_label("Adresse e-mail").fill("paul.martin@gmail.com"); p.get_by_label("Mot de passe").fill("whatever1"); p.get_by_role("button", name="Se connecter", exact=True).click()
    expect(p.get_by_text("créé avec Google")).to_be_visible()
    expect(p.get_by_role("button", name="Continuer avec Apple")).to_have_count(0)
    # 7. demo account keeps sample data
    p.get_by_label("Adresse e-mail").fill("camille@exemple.fr"); p.get_by_label("Mot de passe").fill("demo1234"); p.get_by_role("button", name="Se connecter", exact=True).click()
    expect(p.locator(".h-msg")).to_contain_text("Léa Marchand")
    # 8. AI with server key
    p.goto(B1+"/assistant"); expect(p.get_by_text("IA connectée")).to_be_visible()
    out=[]
    for t in ["Quelle est la capitale du Japon ?","Réveille-moi à 6h45","C'est quoi un bon réveil pour bien dormir ?","Bonjour !","Rappelle-moi de sortir le chien dans 1 heure"]:
        out.append(ask(p,t)); print(">>",t,"->",out[-1][:90].replace("\n"," "))
    assert "Tokyo" in out[0]; assert "06h45" in out[1]; assert out[2].startswith("Réponse de Gemini"); assert out[3].startswith("Réponse de Gemini"); assert "sortir le chien" in out[4].lower()
    p.screenshot(path=f"{OUT}/S06-ai.png")
    # 9. AI without key (other server)
    q=ctx.new_page(); attach(q)
    q.goto(B2+"/connexion"); q.get_by_label("Adresse e-mail").fill("camille@exemple.fr"); q.get_by_label("Mot de passe").fill("demo1234"); q.get_by_role("button", name="Se connecter", exact=True).click()
    q.wait_for_url(B2+"/"); q.goto(B2+"/assistant"); expect(q.get_by_text("IA non configurée")).to_be_visible()
    r=ask(q,"Quelle est la capitale du Japon ?"); print(">> (no key)", r[:90]); assert "GEMINI_API_KEY" in r
    r=ask(q,"Réveille-moi à 6h50"); assert "06h50" in r
    q.goto(B2+"/parametres"); q.wait_for_timeout(500); q.screenshot(path=f"{OUT}/S10.png", full_page=True)
    # mobile
    m=b.new_context(viewport={"width":390,"height":844}); mp=m.new_page(); attach(mp)
    mp.goto(B1+"/"); mp.wait_for_timeout(800); mp.screenshot(path=f"{OUT}/S00-signup-390.png", full_page=True)
    sw=mp.evaluate("document.documentElement.scrollWidth"); 
    if sw>390: errors.append(f"overflow signup {sw}")
    mp.goto(B1+"/connexion"); mp.wait_for_timeout(500); mp.screenshot(path=f"{OUT}/S01-login-390.png", full_page=True)
    b.close()
print("key leaked to browser requests:", leaks or "no")
print("console errors:", errors or "none")

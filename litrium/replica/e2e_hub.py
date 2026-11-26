import json, re, datetime
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
BASE="http://localhost:4173"; OUT="/home/claude/atrium/replica/clone-screens"
errors=[]
def fake_forecast(route):
    q=parse_qs(urlparse(route.request.url).query)
    lat=float(q["latitude"][0]); base=12 if lat>45 else 19
    now=datetime.datetime.now().replace(minute=0,second=0,microsecond=0)
    hours=[(now+datetime.timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(-2,48)]
    days=[(now+datetime.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    body={"current":{"time":now.strftime("%Y-%m-%dT%H:%M"),"temperature_2m":base+0.4,"apparent_temperature":base-1.2,"weather_code":2,"wind_speed_10m":14,"relative_humidity_2m":71,"is_day":1},
      "hourly":{"time":hours,"temperature_2m":[base+(i%6)-2 for i in range(len(hours))],"weather_code":[[0,2,3,61,2,0][i%6] for i in range(len(hours))],"precipitation_probability":[[0,10,30,70,20,0][i%6] for i in range(len(hours))]},
      "daily":{"time":days,"temperature_2m_max":[base+4,base+2,base+6,base+1,base+3,base+5,base+2],"temperature_2m_min":[base-4,base-5,base-2,base-6,base-3,base-1,base-4],"weather_code":[2,61,0,3,80,0,95],"precipitation_probability_max":[10,80,0,30,60,5,90]}}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body), headers={"access-control-allow-origin":"*"})
def fake_geo(route):
    q=parse_qs(urlparse(route.request.url).query)["name"][0].lower()
    res={"lyon":[{"name":"Lyon","admin1":"Auvergne-Rhône-Alpes","country":"France","latitude":45.75,"longitude":4.85}],
         "tokyo":[{"name":"Tokyo","admin1":"Tokyo","country":"Japon","latitude":35.69,"longitude":139.69}]}.get(q,[])
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"results":res} if res else {}), headers={"access-control-allow-origin":"*"})
def fake_rev(route):
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"city":"Marseille"}), headers={"access-control-allow-origin":"*"})
def setup(ctx):
    ctx.route("https://api.open-meteo.com/**", fake_forecast)
    ctx.route("https://geocoding-api.open-meteo.com/**", fake_geo)
    ctx.route("https://api.bigdatacloud.net/**", fake_rev)
def attach(p):
    p.on("console", lambda m: m.type=="error" and errors.append(f"{p.url}: {m.text}"))
    p.on("pageerror", lambda e: errors.append(f"{p.url}: {e}"))
def ask(p, text):
    box=p.get_by_label("Votre message")
    sel=".chat .bubble--assistant .bubble__text"
    n=p.locator(sel).count()
    box.fill(text); box.press("Enter")
    expect(p.locator(sel)).to_have_count(n+1, timeout=8000)
    return p.locator(sel).last.inner_text()
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx=b.new_context(viewport={"width":1440,"height":900}, geolocation={"latitude":43.3,"longitude":5.37}, permissions=["geolocation"], locale="fr-FR")
    setup(ctx); p=ctx.new_page(); attach(p)
    p.goto(BASE+"/connexion"); p.get_by_label("Adresse e-mail").fill("camille@exemple.fr"); p.get_by_label("Mot de passe").fill("demo1234"); p.get_by_role("button", name="Se connecter", exact=True).click()
    p.wait_for_url(BASE+"/"); p.get_by_text("Camille", exact=False).first.wait_for()
    expect(p.locator(".h-wea .weather-now__temp")).to_contain_text("19", timeout=6000)
    expect(p.locator(".h-wea")).to_contain_text("Marseille")
    p.wait_for_timeout(500); p.screenshot(path=f"{OUT}/S02.png", full_page=True)
    # assistant
    p.get_by_role("link", name="Assistant").first.click()
    p.screenshot(path=f"{OUT}/S06-empty.png")
    r=[]
    for t in ["Rappelle-moi d'appeler Léa demain à 9h","Réveille-moi à 7h15 en semaine","Ajoute un rendez-vous dentiste vendredi à 10h",
              "Note : acheter du pain et du café","Envoie à Hugo : j'arrive dans 10 minutes","Quel temps fait-il à Lyon ?",
              "Qu'est-ce que j'ai demain ?","Raconte-moi une blague","aide"]:
        out=ask(p,t); r.append(out); print(">>",t,"\n  ",out.replace("\n"," | ")[:160])
    assert "demain à 09:00" in r[0], r[0]
    assert "07h15" in r[1] and "en semaine" in r[1]
    assert "Dentiste" in r[2] and ("vendredi" in r[2] or "demain" in r[2])
    assert "Note enregistrée" in r[3]
    assert "Message envoyé à Hugo" in r[4]
    assert "Lyon" in r[5] and "12" in r[5]
    assert "Dîner avec Léa" in r[6]
    assert r[7].startswith("Réponse de Gemini"), r[7]
    p.screenshot(path=f"{OUT}/S06.png")
    # top bar ask
    p.goto(BASE+"/"); p.get_by_label("Demander à l'assistant").fill("mes rappels"); p.keyboard.press("Enter")
    expect(p.locator(".bubble--assistant .bubble__text").last).to_contain_text("Appeler Léa", timeout=6000)
    # reminders + notes
    p.goto(BASE+"/notes?vue=rappels"); expect(p.get_by_text("Appeler Léa")).to_be_visible()
    p.get_by_label("À faire", exact=True).fill("Réserver le restaurant"); p.get_by_role("button", name="Ajouter").click()
    expect(p.get_by_text("Réserver le restaurant")).to_be_visible()
    p.get_by_label("Réserver le restaurant", exact=True).click(); expect(p.locator(".done-list summary")).to_contain_text("Terminés (2)")
    p.screenshot(path=f"{OUT}/S09-rappels.png", full_page=True)
    p.goto(BASE+"/notes"); expect(p.get_by_text("Acheter du pain et du café").first).to_be_visible()
    p.get_by_role("button", name="Nouvelle note").click()
    p.get_by_label("Titre", exact=True).fill("Vacances d'été"); p.get_by_label("Contenu").fill("Bretagne ou Corse ?\nRegarder les trains.")
    p.get_by_role("button", name="Épingler").click(); p.get_by_role("button", name="Enregistrer").click()
    expect(p.locator(".notecard").first).to_contain_text("Vacances d'été")
    p.get_by_label("Rechercher dans les notes").fill("zzz"); expect(p.get_by_text("Aucune note trouvée")).to_be_visible()
    p.get_by_label("Rechercher dans les notes").fill("")
    p.screenshot(path=f"{OUT}/S09.png", full_page=True)
    # agenda
    p.goto(BASE+"/agenda"); p.wait_for_timeout(500)
    p.get_by_role("button", name="Événement", exact=True).click()
    p.get_by_label("Titre", exact=True).fill("Cinéma"); p.get_by_label("Début").fill("20:30"); p.get_by_label("Fin").fill("20:00")
    p.get_by_role("button", name="Enregistrer").click(); expect(p.get_by_text("L'heure de fin doit être après le début.")).to_be_visible()
    p.get_by_label("Fin").fill("22:30"); p.get_by_role("button", name="Enregistrer").click()
    expect(p.locator(".evlist")).to_contain_text("Cinéma")
    p.locator(".cal__day.is-selected").focus(); p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
    p.screenshot(path=f"{OUT}/S04.png", full_page=True)
    # alarms
    p.goto(BASE+"/alarmes"); expect(p.get_by_text("07 h 15")).to_be_visible()
    p.get_by_role("switch").first.click(); p.wait_for_timeout(300)
    p.screenshot(path=f"{OUT}/S05.png", full_page=True)
    # weather
    p.goto(BASE+"/meteo"); expect(p.locator(".weather-hero")).to_contain_text("Marseille", timeout=6000)
    p.get_by_label("Ajouter une ville").fill("Tokyo"); p.get_by_role("button", name=re.compile("Tokyo")).click()
    expect(p.locator(".weather-place")).to_have_text("Tokyo")
    p.get_by_label("Ajouter une ville").fill("Xyzville"); expect(p.get_by_text("Aucune ville trouvée")).to_be_visible()
    p.get_by_label("Ajouter une ville").fill("")
    p.wait_for_timeout(300); p.screenshot(path=f"{OUT}/S03.png", full_page=True)
    # friends & messages
    p.goto(BASE+"/messages"); p.get_by_role("button", name="Accepter").click()
    expect(p.get_by_text("Inès Haddad a été ajouté·e")).to_be_visible()
    p.get_by_label("Adresse e-mail").fill("pas-un-email"); p.get_by_role("button", name="Ajouter", exact=True).click()
    expect(p.get_by_text("n'est pas valide")).to_be_visible()
    p.get_by_label("Adresse e-mail").fill("marc@nulle-part.fr"); p.get_by_role("button", name="Ajouter", exact=True).click()
    expect(p.get_by_text("marc@nulle-part.fr n'a pas encore de compte")).to_be_visible()
    p.get_by_label("Adresse e-mail").fill("tom.lefevre@exemple.fr"); p.get_by_role("button", name="Ajouter", exact=True).click()
    expect(p.get_by_role("heading", name="Tom Lefèvre")).to_be_visible()
    p.get_by_label("Message à Tom Lefèvre").fill("Salut Tom, ça va ?"); p.keyboard.press("Enter")
    expect(p.locator(".thread .bubble--user").last).to_contain_text("Salut Tom")
    expect(p.locator(".thread .bubble--assistant")).to_have_count(1, timeout=9000)
    p.screenshot(path=f"{OUT}/S08.png")
    # settings
    p.goto(BASE+"/parametres"); p.get_by_role("radio", name="°F").click(); p.wait_for_timeout(400)
    p.goto(BASE+"/"); expect(p.locator(".h-wea")).to_contain_text("°F", timeout=6000)
    p.goto(BASE+"/parametres"); p.get_by_role("radio", name="°C").click(); p.wait_for_timeout(300)
    p.screenshot(path=f"{OUT}/S10.png", full_page=True)
    # errors: weather down, data layer down
    ctx.unroute("https://api.open-meteo.com/**"); ctx.route("https://api.open-meteo.com/**", lambda r: r.fulfill(status=503, body="x"))
    p.goto(BASE+"/meteo?lieu=c_paris"); p.wait_for_timeout(1200); p.screenshot(path=f"{OUT}/S03-error.png")
    ctx.unroute("https://api.open-meteo.com/**"); ctx.route("https://api.open-meteo.com/**", fake_forecast)
    p.goto(BASE+"/nope"); p.wait_for_timeout(400); p.screenshot(path=f"{OUT}/S11.png")
    # alarm ringing with a fake clock
    c2=b.new_context(viewport={"width":1440,"height":900}, storage_state=ctx.storage_state()); setup(c2); q=c2.new_page(); attach(q)
    t0=datetime.datetime.now().replace(second=50, microsecond=0)
    q.clock.install(time=t0)
    q.goto(BASE+"/alarmes"); q.wait_for_timeout(800)
    q.get_by_role("button", name="Nouvelle alarme").click()
    nxt=(t0+datetime.timedelta(minutes=1)).strftime("%H:%M")
    q.get_by_label("Heure").fill(nxt); q.get_by_label("Nom").fill("Test réveil"); q.get_by_role("checkbox", name="lundi").uncheck() if q.get_by_role("checkbox", name="lundi").is_checked() else None
    for d in ["mardi","mercredi","jeudi","vendredi"]:
        cb=q.get_by_role("checkbox", name=d)
        if cb.is_checked(): cb.uncheck()
    q.get_by_role("button", name="Enregistrer").click(); q.wait_for_timeout(300)
    q.clock.fast_forward(15000); q.wait_for_timeout(1500)
    expect(q.get_by_role("dialog", name="Test réveil")).to_be_visible(timeout=5000)
    q.screenshot(path=f"{OUT}/S05-ringing.png")
    q.get_by_role("button", name="Répéter dans 9 min").click()
    expect(q.get_by_role("dialog")).to_have_count(0)
    q.clock.fast_forward("09:05"); q.wait_for_timeout(1500)
    expect(q.get_by_role("dialog", name="Test réveil")).to_be_visible(timeout=5000)
    q.get_by_role("button", name="Arrêter").click(); q.wait_for_timeout(400)
    print("one-off alarm after stop:", q.locator(".alarm", has_text="Test réveil").get_by_role("switch").is_checked())
    c2.close()
    # sign out / in
    p.goto(BASE+"/"); p.get_by_role("button", name="Mon compte").click(); p.get_by_role("menuitem", name="Se déconnecter").click()
    p.get_by_label("Adresse e-mail").fill("camille@exemple.fr"); p.get_by_label("Mot de passe").fill("abcdefgh"); p.keyboard.press("Enter"); expect(p.get_by_text("Mot de passe incorrect.")).to_be_visible()
    p.screenshot(path=f"{OUT}/S01.png")
    p.get_by_label("Mot de passe").fill("demo1234"); p.keyboard.press("Enter"); p.get_by_text("Camille").first.wait_for()
    # mobile
    m=b.new_context(viewport={"width":390,"height":844}, geolocation={"latitude":43.3,"longitude":5.37}, permissions=["geolocation"], storage_state=ctx.storage_state()); setup(m); mp=m.new_page(); attach(mp)
    for path,name in [("/","S02"),("/meteo","S03"),("/agenda","S04"),("/alarmes","S05"),("/assistant","S06"),("/messages","S07"),("/messages/fr_lea","S08"),("/notes","S09"),("/parametres","S10")]:
        mp.goto(BASE+path); mp.wait_for_timeout(1300)
        sw=mp.evaluate("document.documentElement.scrollWidth")
        if sw>390: errors.append(f"horizontal overflow {path}: {sw}px")
        mp.screenshot(path=f"{OUT}/{name}-390.png", full_page=name not in ("S06","S08"))
    b.close()
print("console errors:", errors or "none")

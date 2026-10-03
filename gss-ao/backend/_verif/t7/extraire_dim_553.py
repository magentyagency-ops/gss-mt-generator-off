# Tour 7 (T7N-1) : extrait la réponse enregistrée du dimensionnement d'etampes2 553 (fixture de test).
import json,sys
d=json.load(open(sys.argv[1]))
for k,v in d['chat'].items():
    s=json.dumps(v,ensure_ascii=False)
    if 'mises_en_situation' in s and 'cas_pratique' in s and 'Saint' in s:
        for rep in v:
            c=rep.get('choices',[{}])[0].get('message',{}).get('content') if isinstance(rep,dict) else None
            if c and 'cas_pratique' in c:
                json.dump(json.loads(c), open(sys.argv[2],'w'), ensure_ascii=False, indent=1); print('ok'); sys.exit(0)
print('rien')

import concurrent.futures,subprocess,pathlib,re,json,hashlib,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
(root/'public/library').mkdir(parents=True,exist_ok=True)
(root/'data').mkdir(exist_ok=True)
items=[
(24264,'红楼梦','曹雪芹','zh','在家族兴衰与日常人情之间，读一场繁华如梦。','rose'),
(23962,'西游记','吴承恩','zh','从花果山到西天，重温想象奇瑰的取经之路。','amber'),
(51828,'聊斋志异','蒲松龄','zh','狐鬼花妖的短篇世界，藏着人情与世态。','teal'),
(24032,'儒林外史','吴敬梓','zh','以冷峻而幽默的笔触，描绘士人的百态。','indigo'),
(23839,'论语','孔子弟子及再传弟子','zh','从简短对话中，读修身、处世与学习之道。','stone'),
(7337,'道德经','老子','zh','八十一章古典思想，适合慢读与反复品味。','emerald'),
(11,'Alice’s Adventures in Wonderland','Lewis Carroll','en','跟随爱丽丝进入奇境，阅读英文原版的语言游戏。','violet'),
(1342,'Pride and Prejudice','Jane Austen','en','从偏见到理解，走进奥斯汀笔下的英国乡间。','rose'),
(84,'Frankenstein','Mary Shelley','en','一场关于创造、孤独与责任的哥特式追问。','slate'),
(120,'Treasure Island','Robert Louis Stevenson','en','藏宝图、海盗与远航，一部充满悬念的冒险小说。','sky'),
(46,'A Christmas Carol','Charles Dickens','en','三个幽灵来访，让守财奴重新看见生活的温度。','emerald'),
(2701,'Moby Dick','Herman Melville','en','追逐白鲸的海上旅程，交织执念与命运。','indigo'),
]
def download(row):
 id,title,author,lang,description,tone=row
 url=f'https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt'
 page=subprocess.check_output(['curl','-fsSL','--max-time','30',f'https://www.gutenberg.org/ebooks/{id}']).decode()
 if 'Public domain in the USA.' not in page:raise ValueError(f'Copyright status needs review: {id}')
 raw=subprocess.check_output(['curl','-fsSL','--retry','2',url]).decode('utf-8-sig')
 start=re.search(r'\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\r\n]*',raw,re.I)
 end=re.search(r'\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK',raw,re.I)
 if not start or not end:raise ValueError(f'Cannot identify public-domain body: {id}')
 body=raw[start.end():end.start()].strip()
 # Source acknowledgements live in SOURCES.md, not in the redistributed reading text.
 body='\n'.join(line for line in body.splitlines() if not re.search('gutenberg',line,re.I)).strip()+'\n'

 # Use only the narrative/classical text, not transcriber notes or later-edition prefaces.
 if id == 1342:
  first=re.search(r'\[Illustration:\s*·PRIDE AND PREJUDICE·.*?Chapter I\.\]',body,re.S)
  if not first:raise ValueError('Pride and Prejudice first chapter needs manual review')
  body='CHAPTER I.\n\n'+body[first.end():]
 elif lang == 'zh':
  first=re.search(r'(?m)^(?:第[一二三四五六七八九十百0-9]+[回章]|學而第一|卷一)',body)
  if first:body=body[first.start():]
 else:
  pattern={11:r'(?m)^CHAPTER I\.\s*$',84:r'(?m)^Letter 1\s*$',120:r'(?m)^I\s*$',46:r'(?m)^STAVE I:.*$',2701:r'(?m)^CHAPTER 1\. Loomings\.\s*$'}[id]
  matches=list(re.finditer(pattern,body))
  if not matches:raise ValueError(f'First chapter needs review: {id}')
  body=body[matches[-1].start():]
 body=re.sub(r'\[Illustration[^\]]*\]','',body,flags=re.S|re.I).strip()+'\n'

 if len(body)<1000:raise ValueError(f'Empty title: {id}')
 target=root/f'public/library/pg-{id}.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  info=zipfile.ZipInfo('book.txt',date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,body.encode('utf-8'))
 return dict(id=f'pg-{id}',title=title,author=author,language=lang,description=description,tone=tone,
 sourceUrl=f'https://www.gutenberg.org/ebooks/{id}',assetUrl=f'/library/pg-{id}.zip',
 filename=title+'.txt',bytes=target.stat().st_size,sha256=hashlib.sha256(body.encode()).hexdigest())
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:books=list(pool.map(download,items))
(root/'data/library.ts').write_text('// Curated original-language public-domain texts. See public/library/SOURCES.md.\nexport const LIBRARY_BOOKS = '+json.dumps(books,ensure_ascii=False,indent=2)+' as const;\n')
print(json.dumps([{'id':b['id'],'title':b['title'],'bytes':b['bytes']} for b in books],ensure_ascii=False))

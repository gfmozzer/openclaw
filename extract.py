import ast

with open("transcript.txt", encoding="utf-8") as f:
    text = f.read()

data = ast.literal_eval(text)
if isinstance(data[0], list):
    data = data[0]

res = []
for d in data:
    if d['start'] > 500:
        res.append(f"[{d['start']}] {d['text']}")

with open("clean_transcript.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(res))

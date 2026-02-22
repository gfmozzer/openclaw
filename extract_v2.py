import sys
from youtube_transcript_api import YouTubeTranscriptApi
t = YouTubeTranscriptApi.get_transcript('TbI-6zc9G5w', languages=['pt', 'en'])
res = [f'[{x["start"]}] {x["text"]}' for x in t if x['start'] > 500]
with open('clean_transcript.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(res))

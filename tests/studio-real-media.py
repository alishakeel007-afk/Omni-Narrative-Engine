"""CPU export verification using the already-generated public validation clips."""
from pathlib import Path
import array
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from uuid import uuid4
from unittest.mock import patch
import static_ffmpeg
from PIL import Image, ImageChops

static_ffmpeg.add_paths()
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'workers/video'))
import exporter

SAVED = ROOT / '.run-screenshots/existing-media'
os.environ['LTX_FONT_PATH'] = 'Manrope.ttf'
sources = [SAVED / 'validation-text.mp4', SAVED / 'validation-image.mp4']
if not all(source.is_file() for source in sources):
    raise SystemExit('Download the existing validation media before running this check.')
output = SAVED / 'edited-validation.mp4'
baseline = SAVED / 'edited-without-overlay.mp4'
clips = [{'url':f'https://demo.supabase.co/{index}.mp4','start':start,'end':end,'volume':.8,'voices':[],'music':None,
          'texts':[{'text':"Rehearsal: it's 100% our story",'start':.4,'end':1.4,'x':.5,'y':.8,'size':30,'color':'#ffffff'}] if index==0 else []}
         for index,(start,end) in enumerate([(.25,2.75),(1,3.5)])]

def local_source(url,destination):
    shutil.copyfile(sources[int(url.rsplit('/',1)[1].split('.')[0])],destination)

with tempfile.TemporaryDirectory(prefix='studio-media-') as temp:
    previous = Path.cwd()
    try:
        os.chdir(temp)
        shutil.copyfile(ROOT / 'public/fonts/Manrope.ttf','Manrope.ttf')
        with patch.object(exporter,'download',local_source):
            exporter.render({'request_id':str(uuid4()),'clips':clips},str(output))
            plain = [{**clip,'texts':[]} for clip in clips]
            exporter.render({'request_id':str(uuid4()),'clips':plain},str(baseline))
    finally:
        os.chdir(previous)

probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(output)],text=True))
video = next(stream for stream in probe['streams'] if stream['codec_type']=='video')
audio = next(stream for stream in probe['streams'] if stream['codec_type']=='audio')
assert video['codec_name']=='h264' and audio['codec_name']=='aac'
assert (video['width'],video['height'])==(1024,576)
assert video['r_frame_rate']=='24/1'
assert abs(float(probe['format']['duration'])-5)<.08

def frame(path,seconds):
    import io
    raw = subprocess.check_output(['ffmpeg','-v','error','-ss',str(seconds),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
    return Image.open(io.BytesIO(raw)).convert('RGB').crop((0,370,1024,560))

differences = {}
for seconds in [.2,.8,1.8,3.2]:
    delta = ImageChops.difference(frame(output,seconds),frame(baseline,seconds))
    differences[str(seconds)] = sum(value*count for value,count in enumerate(delta.convert('L').histogram())) / (delta.width*delta.height)
assert differences['0.8']>1, differences
# H.264 motion prediction propagates small quantization differences within a
# clip when one frame contains text; the visible overlay must dominate those.
assert max(differences['0.2'],differences['1.8'],differences['3.2'])<1, differences
assert differences['0.8']>2*max(differences['0.2'],differences['1.8'],differences['3.2']), differences

def samples(path,start=None,end=None):
    command=['ffmpeg','-v','error','-i',str(path)]
    if start is not None: command+=['-af',f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,volume=0.8']
    raw=subprocess.check_output(command+['-ac','1','-ar','8000','-f','s16le','-'])
    result=array.array('h'); result.frombytes(raw); return result

expected=[*samples(sources[0],.25,2.75),*samples(sources[1],1,3.5)]
actual=samples(output)
def envelope(values):
    return [math.sqrt(sum(float(value)**2 for value in values[index:index+80])/80) for index in range(0,len(values)-80,80)]
a,b=envelope(expected),envelope(actual)
def correlation(lag):
    pairs=[(a[index],b[index+lag]) for index in range(20,min(len(a),len(b))-20) if 0<=index+lag<len(b)]
    ma=sum(x for x,y in pairs)/len(pairs); mb=sum(y for x,y in pairs)/len(pairs)
    return sum((x-ma)*(y-mb) for x,y in pairs)/math.sqrt(sum((x-ma)**2 for x,y in pairs)*sum((y-mb)**2 for x,y in pairs))
best=max(range(-20,21),key=correlation)
print(json.dumps({'best_audio_lag':best*.01,'correlation':correlation(best),'sample_counts':[len(expected),len(actual)],'duration':probe['format']['duration']}))
assert abs(best)*.01<=.08, best
assert correlation(best)>.9,correlation(best)
report={'duration':probe['format']['duration'],'video_codec':video['codec_name'],'audio_codec':audio['codec_name'],
        'size':[video['width'],video['height']],'fps':video['r_frame_rate'],'caption_pixel_difference':differences,
        'audio_alignment_seconds':best*.01,'audio_envelope_correlation':correlation(best)}
(SAVED / 'export-verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
print('PASS: real saved media trimmed, concatenated, overlaid and encoded by the production FFmpeg exporter; overlay windows and audio timing checked. No new video generation.')

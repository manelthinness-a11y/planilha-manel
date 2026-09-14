#!/usr/bin/env python3
"""Build a signed, verifiable APK using Android SDK Build Tools 35 and Java 17.

No Gradle dependency or network request occurs during the build. Keep signing
credentials outside this repository and reuse them for every future release.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--build-tools', type=Path, required=True)
parser.add_argument('--android-jar', type=Path, required=True)
parser.add_argument('--keystore', type=Path, required=True)
parser.add_argument('--password-file', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent
build = root / 'build'
if build.exists():
    shutil.rmtree(build)
for folder in ['generated', 'classes', 'dex']:
    (build / folder).mkdir(parents=True, exist_ok=True)
args.output.parent.mkdir(parents=True, exist_ok=True)

def run(*command):
    subprocess.run([str(arg) for arg in command], check=True)

tools = args.build_tools.resolve()
platform = args.android_jar.resolve()
run(tools / 'aapt2', 'compile', '--dir', root / 'res', '-o', build / 'resources.zip')
run(tools / 'aapt2', 'link', '-I', platform, '--manifest', root / 'AndroidManifest.xml',
    '--java', build / 'generated', build / 'resources.zip', '-o', build / 'resources.apk')
sources = list((root / 'src').rglob('*.java')) + list((build / 'generated').rglob('*.java'))
run('java', 'com.sun.tools.javac.Main', '-source', '8', '-target', '8', '-encoding', 'UTF-8',
    '-bootclasspath', str(tools / 'core-lambda-stubs.jar') + os.pathsep + str(platform),
    '-d', build / 'classes', *sources)
with zipfile.ZipFile(build / 'classes.jar', 'w', zipfile.ZIP_DEFLATED) as jar:
    for source in sorted((build / 'classes').rglob('*.class')):
        jar.write(source, source.relative_to(build / 'classes'))
run(tools / 'd8', '--release', '--min-api', '26', '--lib', platform,
    '--output', build / 'dex', build / 'classes.jar')
shutil.copyfile(build / 'resources.apk', build / 'unsigned.apk')
with zipfile.ZipFile(build / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as apk:
    for dex in sorted((build / 'dex').glob('*.dex')):
        apk.write(dex, dex.name)
run(tools / 'zipalign', '-f', '4', build / 'unsigned.apk', build / 'aligned.apk')
run(tools / 'apksigner', 'sign', '--ks', args.keystore.resolve(), '--ks-key-alias', 'manel',
    '--ks-pass', 'file:' + str(args.password_file.resolve()),
    '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
    '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false',
    '--out', args.output.resolve(), build / 'aligned.apk')
run(tools / 'zipalign', '-c', '4', args.output.resolve())
run(tools / 'apksigner', 'verify', '--verbose', '--print-certs', args.output.resolve())
run(tools / 'aapt', 'dump', 'badging', args.output.resolve())
digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
(args.output.parent / (args.output.name + '.sha256')).write_text(digest + '  ' + args.output.name + '\n')
print(json.dumps({'apk': str(args.output.resolve()), 'sha256': digest, 'bytes': args.output.stat().st_size}))

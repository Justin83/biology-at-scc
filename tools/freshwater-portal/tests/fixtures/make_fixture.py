"""Regenerates exif-gps-orientation6.jpg, the test photo for observation-form.e2e.mjs.

A synthetic 640x480 image (red block in the top-left corner) whose EXIF says:
  Orientation 6 (rotate 90 deg clockwise to display), so the form must output a 480x640
  portrait with the red block top-right; DateTimeOriginal 2026:11:03 14:21:05, offset -05:00;
  GPS = the portal's public campus address point (37.059788, -84.616904), accuracy 8 m;
  camera "TestCam Field Phone 1".  Requires Pillow:  python3 make_fixture.py
"""
import os
from PIL import Image, ImageDraw
from PIL.ExifTags import IFD, Base, GPS
from PIL.TiffImagePlugin import IFDRational as R

def dms(x):
    x = abs(x); d = int(x); m = int((x - d) * 60); s = ((x - d) * 60 - m) * 60
    return (R(d, 1), R(m, 1), R(int(round(s * 10000)), 10000))

img = Image.new("RGB", (640, 480), (40, 110, 90))
draw = ImageDraw.Draw(img)
for i in range(0, 640, 40):
    draw.line([(i, 0), (i + 160, 480)], fill=(90, 150, 130), width=8)
draw.rectangle([16, 16, 176, 116], fill=(220, 60, 40))
ex = Image.Exif()
ex[Base.Make] = "TestCam"
ex[Base.Model] = "Field Phone 1"
ex[Base.Orientation] = 6
ex.get_ifd(IFD.Exif)[Base.DateTimeOriginal] = "2026:11:03 14:21:05"
ex.get_ifd(IFD.Exif)[Base.OffsetTimeOriginal] = "-05:00"
g = ex.get_ifd(IFD.GPSInfo)
g[GPS.GPSLatitudeRef] = "N"; g[GPS.GPSLatitude] = dms(37.059788)
g[GPS.GPSLongitudeRef] = "W"; g[GPS.GPSLongitude] = dms(-84.616904)
g[GPS.GPSHPositioningError] = R(8, 1)
img.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "exif-gps-orientation6.jpg"), "JPEG", quality=75, exif=ex)

"""Our Kestrel from the side, orthographic, on a transparent background, at a fixed scale.

The input to tools/cars/overlay.py, which lays this silhouette over a reference side view and
prints the height difference along the car. Scale and framing are fixed in numbers shared with
that script: 250 px per metre, ground at row 554, the car's centre at column 477.5 of a 1024x768
frame (the reference image's wheel centres, see overlay.py).

  blender -b -P tools/cars/sideview.py -- kestrel.glb OUT.png [rear]

With `rear` the camera looks along the car from behind (same scale, car centred on column 512,
ground at row 554) for rearview.py, which compares widths.
"""
import bpy, sys, math
args = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = args[0], args[1]
PXM, W, H = 250.0, 1024, 768
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
w = bpy.data.worlds.new('w'); w.use_nodes = True; scene.world = w
l = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); l.data.energy = 3
l.rotation_euler = (0.9, 0.2, 0.7); scene.collection.objects.link(l)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = W / PXM
# glTF import is y-up with the nose on +Z, which Blender turns back into nose -Y, z up.
cam.location = (10, (512 - 477.5) / PXM, (554 - 384) / PXM)
cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
if 'rear' in args[2:]:
    cam.location = (0, 10, (554 - 384) / PXM)
    cam.rotation_euler = (math.pi / 2, 0, math.pi)
scene.camera = cam
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)

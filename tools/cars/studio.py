"""Our Kestrel in a studio, framed like the reference side view, to compare how the paint reads.

Why: plan item 4 in docs/research/car-pilot-trellis.md. The reference render looks real mostly
because of clean reflections along the flank, and the preview renders (flat grey floor, one sun)
cannot show whether ours has any. This lays the same model under a grey gradient world, two large
softboxes and a glossy floor, with a long lens at the side-view distance, in Cycles.

  blender -b -P tools/cars/studio.py -- kestrel.glb OUT.png [side|front34|rear34]

The model's own materials are used (glTF clearcoat included), so this shows the geometry and the
paint's response, not the game's shader; look in the game too.
"""
import bpy, sys, math
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = args[0], args[1]
VIEW = args[2] if len(args) > 2 else 'side'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x, sc.render.resolution_y = 1024, 768
w = bpy.data.worlds.new('w'); w.use_nodes = True; sc.world = w
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.5, 0.52, 0.55, 1); bg.inputs[1].default_value = 0.35
def area(name, loc, size, energy):
    d = bpy.data.lights.new(name, 'AREA'); d.size = size[0]; d.size_y = size[1]; d.energy = energy
    o = bpy.data.objects.new(name, d); o.location = loc; sc.collection.objects.link(o)
    o.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
area('top', (0, 0, 4.0), (5, 2.5), 700)
area('left', (-4, 4, 2.2), (3, 1.2), 500)
area('right', (4, -4, 1.8), (3, 1.2), 350)
floor = bpy.data.objects.new('floor', bpy.data.meshes.new('floor'))
floor.data.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
fm = bpy.data.materials.new('floor'); fm.use_nodes = True
b = fm.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.7, 0.7, 0.72, 1); b.inputs['Roughness'].default_value = 0.25
floor.data.materials.append(fm); sc.collection.objects.link(floor)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.data.lens = 85; sc.camera = cam
ctr = Vector((0, 0, 0.55))
off = {'side': (13, 0, 0.7), 'front34': (8, -9, 2.6), 'rear34': (-8, 9, 2.6)}[VIEW]
cam.location = ctr + Vector(off)
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)

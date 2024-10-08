import { Object3d } from '@/engine/renderer/object-3d';
import { Mesh } from '@/engine/renderer/mesh';

export class Scene extends Object3d {
  solidMeshes: Mesh[] = [];

  add_(...object3ds: Object3d[]) {
    super.add_(...object3ds);
    const flatWithChildren = [...object3ds, ...object3ds.flatMap(object3d => object3d.allChildren())];
    flatWithChildren.forEach(object3d => {
      // @ts-ignore
      if (object3d.geometry) {
        // @ts-ignore
        object3d.geometry.bindGeometry();
        // @ts-ignore
        this.solidMeshes.push(object3d);
      }
    })
  }

  remove_(object3d: Object3d) {
    super.remove_(object3d);
    [object3d, ...object3d.allChildren()]
      .forEach(obj => {
      // @ts-ignore
      if (obj.geometry) {
        // @ts-ignore
        this.solidMeshes = this.solidMeshes.filter(mesh => mesh !== obj);
      }
    });
  }
}

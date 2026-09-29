import * as THREE from "three";

export type BirdActor = {
  group: THREE.Group;
  wings: THREE.Mesh[];
  note: THREE.Sprite;
  cycle: number;
  tree: number;
};

export type ButterflyActor = {
  group: THREE.Group;
  wingPivots: THREE.Group[];
  wingMaterials: THREE.MeshStandardMaterial[];
  cycle: number;
  planter: number;
};

type ThirdFloorCourtyardLifeContext = {
  thirdFloor: THREE.Group;
  courtyardTreePoints: number[][];
  makeBird: () => BirdActor;
  makeButterfly: (index: number) => ButterflyActor;
};

export function createThirdFloorCourtyardLife({
  thirdFloor,
  courtyardTreePoints,
  makeBird,
  makeButterfly,
}: ThirdFloorCourtyardLifeContext) {
  // Keep exactly two birds in the courtyard. They remain parented to 3F so
  // every coordinate is courtyard-local.
  const courtyardBirds = Array.from({ length: 2 }, () => makeBird());
  courtyardBirds.forEach((bird) => {
    bird.group.scale.setScalar(0.82);
    bird.group.userData.floor = 3;
    thirdFloor.add(bird.group);
  });

  const courtyardButterflies = Array.from({ length: 3 }, (_, index) =>
      makeButterfly(index + 1),
    ),
    courtyardButterflyRoutes = [
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-5.2, 1.22, 3.05),
          new THREE.Vector3(-3.05, 1.52, 3.28),
          new THREE.Vector3(-3.45, 1.34, 6.05),
          new THREE.Vector3(-5.65, 1.48, 6.72),
        ],
        true,
        "catmullrom",
        0.42,
      ),
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(5.35, 1.38, 3.18),
          new THREE.Vector3(3.05, 1.64, 3.48),
          new THREE.Vector3(3.55, 1.28, 6.02),
          new THREE.Vector3(5.95, 1.55, 6.82),
        ],
        true,
        "catmullrom",
        0.42,
      ),
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-4.35, 1.18, 6.55),
          new THREE.Vector3(-2.15, 1.58, 4.82),
          new THREE.Vector3(1.85, 1.36, 3.18),
          new THREE.Vector3(4.65, 1.62, 5.78),
          new THREE.Vector3(0.2, 1.42, 6.92),
        ],
        true,
        "catmullrom",
        0.38,
      ),
    ];
  courtyardButterflies.forEach((butterfly) => {
    butterfly.group.visible = true;
    thirdFloor.add(butterfly.group);
  });

  const faceDirection = (from: THREE.Vector3, to: THREE.Vector3) =>
    Math.atan2(-(to.z - from.z), to.x - from.x);

  const updateThirdFloorCourtyardLife = (t: number) => {
    courtyardBirds.forEach((bird, index) => {
      const cycleLength = 38,
        cycle = Math.floor(t / cycleLength),
        phase = t % cycleLength,
        activeCount = 2,
        localPhase = phase - index * 2.4;
      bird.note.visible = false;
      if (index >= activeCount || localPhase < 4 || localPhase > 31.5) {
        bird.group.visible = false;
        return;
      }
      if (cycle !== bird.cycle) {
        bird.cycle = cycle;
        bird.tree = (cycle * 2 + index) % courtyardTreePoints.length;
      }
      const [treeX, treeZ] = courtyardTreePoints[bird.tree],
        perch = new THREE.Vector3(treeX, 2.48, treeZ),
        from = new THREE.Vector3(
          (index - 1) * 7.2,
          5.2 + index * 0.2,
          15.5 + index * 0.6,
        ),
        to = new THREE.Vector3(
          (1 - index) * 13.5,
          6.5 + index * 0.28,
          19.5 + index * 0.7,
        );
      bird.group.visible = true;
      if (localPhase < 12.5) {
        const progress = THREE.MathUtils.smoothstep(
          (localPhase - 4) / 8.5,
          0,
          1,
        );
        bird.group.position.lerpVectors(from, perch, progress);
        bird.group.position.y += Math.sin(progress * Math.PI) * 0.82;
        bird.group.rotation.y = faceDirection(from, perch);
        bird.wings[0].rotation.x = Math.sin(t * 18 + index) * 0.9;
        bird.wings[1].rotation.x = -Math.sin(t * 18 + index) * 0.9;
      } else if (localPhase < 21.5) {
        bird.group.position.copy(perch);
        bird.group.rotation.y = index % 2 ? Math.PI * 0.2 : -Math.PI * 0.2;
        bird.wings.forEach((wing) => (wing.rotation.x = 0.08));
        bird.note.visible = true;
        const pulse = 0.6 + Math.sin(t * 6.2 + index) * 0.07;
        bird.note.scale.set(pulse, pulse, 1);
        bird.note.position.y = 0.82 + Math.sin(t * 4.2 + index) * 0.07;
      } else {
        const progress = THREE.MathUtils.smoothstep(
          (localPhase - 21.5) / 10,
          0,
          1,
        );
        bird.group.position.lerpVectors(perch, to, progress);
        bird.group.position.y += Math.sin(progress * Math.PI) * 0.92;
        bird.group.rotation.y = faceDirection(perch, to);
        bird.wings[0].rotation.x = Math.sin(t * 18 + index) * 0.9;
        bird.wings[1].rotation.x = -Math.sin(t * 18 + index) * 0.9;
      }
    });

    courtyardButterflies.forEach((butterfly, index) => {
      const route = courtyardButterflyRoutes[index],
        progress = (t / (17.5 + index * 2.7) + index * 0.29) % 1,
        point = route.getPointAt(progress),
        nextPoint = route.getPointAt((progress + 0.008) % 1),
        verticalFloat =
          Math.sin(t * (2.15 + index * 0.16) + index * 1.3) * 0.13 +
          Math.sin(t * (4.85 + index * 0.18) + index * 0.7) * 0.05,
        flapEnvelope = 0.7 + Math.sin(t * 0.86 + index) * 0.3,
        flap = THREE.MathUtils.degToRad(
          42 +
            Math.sin(t * (11.6 + index * 0.72) + index * 0.9) *
              (18 + flapEnvelope * 14),
        );
      butterfly.group.visible = true;
      butterfly.group.position.copy(point);
      butterfly.group.position.y += verticalFloat;
      butterfly.group.position.z += Math.sin(t * 1.36 + index) * 0.07;
      butterfly.group.rotation.y =
        Math.atan2(-(nextPoint.z - point.z), nextPoint.x - point.x) +
        Math.sin(t * 0.78 + index * 1.4) * 0.14;
      butterfly.group.rotation.z = Math.sin(t * 1.58 + index) * 0.07;
      butterfly.wingPivots[0].rotation.x = flap;
      butterfly.wingPivots[1].rotation.x = -flap;
    });
  };

  return {
    courtyardBirds,
    updateThirdFloorCourtyardLife,
  };
}

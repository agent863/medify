import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Role = "doctor" | "nurse" | "patient" | "assistant";
type Gender = "male" | "female";

export type ThirdFloorCareWalker = {
  group: THREE.Group;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  hands: THREE.Mesh[];
  phone?: THREE.Mesh;
  medicineBag?: THREE.Group;
  chart?: THREE.Mesh;
  headRig: THREE.Group;
  route: THREE.Vector3[];
  waypoint: number;
  speed: number;
  role: Role;
  gender: Gender;
  pause: number;
  stuck: number;
  action: string;
};

export type ThirdFloorWardBedSlot = {
  room: number;
  index: number;
  bedCentre: THREE.Vector3;
  bedYaw: number;
  bedForward: THREE.Vector3;
  bedSide: THREE.Vector3;
  cabinetSide: number;
  doorCentre: THREE.Vector3;
  out: THREE.Vector3;
  tan: THREE.Vector3;
  doorIndex: number;
  ivStand: THREE.Group;
  overbed: THREE.Group;
};

type Walker = ThirdFloorCareWalker;
type WardBedSlot = ThirdFloorWardBedSlot;

type WardSwingDoor = {
  pivots: Array<{ pivot: THREE.Group; side: number; closedYaw: number }>;
  openAmount: number;
  openTarget: 0 | 1;
};

type CourtyardAutoDoor = {
  root: THREE.Group;
  tangent: THREE.Vector3;
  leaves: Array<{ mesh: THREE.Mesh; closed: THREE.Vector3; side: number }>;
  opening: number;
  openAmount: number;
  openTarget: 0 | 1;
  closeAt: number;
};

type PersonFactory = (
  scene: THREE.Scene | THREE.Group,
  role: Role,
  color: number,
  start: THREE.Vector3,
  route: THREE.Vector3[],
  speed: number,
  room?: number,
  gender?: Gender,
  styleSeed?: number,
) => ThirdFloorCareWalker;

export type ThirdFloorCareContext = {
  thirdFloor: THREE.Group;
  wardBedSlots: ThirdFloorWardBedSlot[];
  thirdFloorContentScale: number;
  wardSwingDoors: WardSwingDoor[];
  courtyardAutoDoors: CourtyardAutoDoor[];
  courtyardDoorOpening: number;
  courtyardFacadeHalf: number;
  courtyardNorthWest: THREE.Vector3;
  courtyardNorthEast: THREE.Vector3;
  westDoorCentre: THREE.Vector3;
  eastDoorCentre: THREE.Vector3;
  thirdFloorMedicalCarts: THREE.Group[];
  interactive: THREE.Object3D[];
  person: PersonFactory;
  material: (color: number, roughness?: number) => THREE.MeshStandardMaterial;
  cyl: (radius: number, height: number, color: number, segments?: number) => THREE.Mesh;
};

export function createThirdFloorCare({
  thirdFloor,
  wardBedSlots,
  thirdFloorContentScale,
  wardSwingDoors,
  courtyardAutoDoors,
  courtyardDoorOpening,
  courtyardFacadeHalf,
  courtyardNorthWest,
  courtyardNorthEast,
  westDoorCentre,
  eastDoorCentre,
  thirdFloorMedicalCarts,
  interactive,
  person,
  material,
  cyl,
}: ThirdFloorCareContext) {
    // THIRD-FLOOR INPATIENT CARE -----------------------------------------
    type InpatientTask = "eat" | "walk" | "courtyardSit";
    type InpatientArrival =
      | "bedRest"
      | "courtyardSit"
      | "waitingCheck";
    type InpatientState =
      | "bedRest"
      | "bedEat"
      | "waitingMedication"
      | "medicationSittingUp"
      | "takingMedication"
      | "medicationSettling"
      | "rising"
      | "walking"
      | "parkingIv"
      | "settling"
      | "courtyardSit"
      | "socialTalk"
      | "waitingCheck"
      | "beingChecked";
    type InpatientActor = {
      walker: Walker;
      slot: WardBedSlot;
      gown: THREE.Mesh;
      tray: THREE.Group;
      state: InpatientState;
      timer: number;
      route: THREE.Vector3[];
      waypoint: number;
      arrival: InpatientArrival;
      lastTask?: InpatientTask;
      activityPriority: number;
      lastActivitySequence: number;
      assignedCourtyardSeat?: number;
      assignedCourtyardDoor?: 0 | 1 | 2;
      inspectionReserved: boolean;
      partner?: number;
      pausedCourtyardRest: number;
      conversationVisitor: boolean;
      blockedTime: number;
      avoidanceDetourActive: boolean;
      avoidanceAttempt: number;
      courtyardTrafficWait: number;
      motionStallTime: number;
      motionWatchPosition: THREE.Vector3;
      doorPassOverride: number;
      transitionFromPosition: THREE.Vector3;
      transitionFromQuaternion: THREE.Quaternion;
      transitionFromScale: THREE.Vector3;
      transitionToPosition: THREE.Vector3;
      transitionToQuaternion: THREE.Quaternion;
      transitionToScale: THREE.Vector3;
      transitionStartsSeated: boolean;
      ivParkPosition: THREE.Vector3;
      ivTransitionFromPosition: THREE.Vector3;
      postInspectionCooldown: number;
      medicationReserved: boolean;
      medicationPill: THREE.Mesh;
    };
    type WardNurseMode =
      | "station"
      | "outbound"
      | "checking"
      | "waitingNext"
      | "returning";
    type WardNurseActor = {
      walker: Walker;
      index: number;
      cart: THREE.Group;
      cartHome: THREE.Vector3;
      mode: WardNurseMode;
      route: THREE.Vector3[];
      waypoint: number;
      cartAttachWaypoint: number;
      cartAttached: boolean;
      cartParked: boolean;
      reverseWaypoint: number;
      targetPatient?: number;
      timer: number;
      blockedTime: number;
      motionStallTime: number;
      motionWatchPosition: THREE.Vector3;
      navigationOverride: number;
    };
    type MedicationRobotMode =
      | "home"
      | "outbound"
      | "serving"
      | "returning";
    type MedicationRobotActor = {
      group: THREE.Group;
      home: THREE.Vector3;
      mode: MedicationRobotMode;
      route: THREE.Vector3[];
      waypoint: number;
      targetPatient?: number;
      previousSlot?: WardBedSlot;
      timer: number;
      wheelPhase: number;
      doorOpenAmount: number;
      departureStaging: boolean;
      waitingForNurseRoom?: number;
      nurseRoomWaitPoint?: THREE.Vector3;
      actorYieldSafetyPoint?: THREE.Vector3;
    };

    const inpatientWalkSpeed = 0.52,
      wardNurseWalkSpeed = inpatientWalkSpeed * 1.15,
      // Keep the cart close enough for the 0.49 m rig arms to reach its rear
      // rail without letting the nurse torso overlap the cart body.
      wardNurseCartDistance = 0.8,
      thirdFloorYaw = (from: THREE.Vector3, to: THREE.Vector3) =>
        Math.atan2(-(to.x - from.x), -(to.z - from.z)),
      // Patient and nurse rigs both face local -Z (hair is on +Z). Keeping
      // one model-forward convention prevents side/backward walking.
      thirdFloorPatientYaw = (from: THREE.Vector3, to: THREE.Vector3) =>
        thirdFloorYaw(from, to),
      firstDistinctRouteTarget = (
        origin: THREE.Vector3,
        route: THREE.Vector3[],
      ) =>
        route.find((point) => point.distanceToSquared(origin) > 0.02) ??
        origin.clone().add(new THREE.Vector3(0, 0, -1)),
      thirdFloorRouteDirection = (
        current: THREE.Vector3,
        route: THREE.Vector3[],
        waypoint: number,
        cornerRadius: number,
      ) => {
        const target = route[waypoint],
          direct = target
            ? target.clone().sub(current).setY(0)
            : new THREE.Vector3(0, 0, -1);
        if (direct.lengthSq() < 0.0001) return direct.set(0, 0, -1);
        const remaining = direct.length(),
          next = route[waypoint + 1];
        direct.normalize();
        if (!target || !next || remaining >= cornerRadius) return direct;
        const nextDirection = next.clone().sub(target).setY(0);
        if (nextDirection.lengthSq() < 0.0001) return direct;
        nextDirection.normalize();
        if (direct.dot(nextDirection) < -0.25) return direct;
        const blend =
          THREE.MathUtils.smoothstep(1 - remaining / cornerRadius, 0, 1) *
          0.72;
        return direct.lerp(nextDirection, blend).normalize();
      },
      northCourtyardDoor = courtyardNorthWest
        .clone()
        .add(courtyardNorthEast)
        .multiplyScalar(0.5),
      northCourtyardInside = new THREE.Vector3(0, 0, 0.42),
      courtyardStoneSeatBases = [
        new THREE.Vector3(-2.37, 0.14, 2.09),
        new THREE.Vector3(2.37, 0.14, 2.09),
        new THREE.Vector3(-2.43, 0.14, 4.87),
        new THREE.Vector3(2.43, 0.14, 4.87),
      ],
      courtyardPlantingCentres = [
        new THREE.Vector3(-3.35, 0, 0.48),
        new THREE.Vector3(3.35, 0, 0.48),
        new THREE.Vector3(-3.7, 0, 5.58),
        new THREE.Vector3(3.7, 0, 5.58),
      ],
      // Each stone bench has two explicit places. Patients select a seat as a
      // normal rest task; a conversation may begin only after both adjacent
      // places on the same bench are already occupied.
      courtyardStoneSeatBodyOffset = 0.1,
      courtyardStoneSeats = courtyardStoneSeatBases.flatMap((base, benchIndex) => {
        const facing = new THREE.Vector3(0, 0, 3.48)
            .sub(base)
            .setY(0)
            .normalize(),
          tangent = new THREE.Vector3(-facing.z, 0, facing.x),
          outward = base
            .clone()
            .sub(courtyardPlantingCentres[benchIndex])
            .setY(0)
            .normalize();
        // The stone cap is 46 cm deep. Keep a modest promenade-side inset so
        // the hips visibly remain over the seat surface while the torso and
        // rise origin still stay outside the planting bed.
        return [
          base
            .clone()
            .addScaledVector(tangent, -0.46)
            .addScaledVector(outward, courtyardStoneSeatBodyOffset),
          base
            .clone()
            .addScaledVector(tangent, 0.46)
            .addScaledVector(outward, courtyardStoneSeatBodyOffset),
        ];
      }),
      // Each stone seat has one fixed promenade-facing direction derived
      // from its planting bed. Seating and departure both use this direction,
      // so the flowerbed can never become the patient's forward side.
      courtyardStoneSeatOutwardDirections = courtyardStoneSeatBases.flatMap(
        (base, benchIndex) => {
          const outward = base
            .clone()
            .sub(courtyardPlantingCentres[benchIndex])
            .setY(0)
            .normalize();
          return [outward.clone(), outward.clone()];
        },
      ),
      courtyardStoneSeatExitPoint = (seatIndex: number) =>
        courtyardStoneSeats[seatIndex]
          .clone()
          .setY(0)
          .addScaledVector(
            courtyardStoneSeatOutwardDirections[seatIndex],
            1.28,
          ),
      courtyardStoneSeatChannelContains = (
        seatIndex: number,
        point: THREE.Vector3,
      ) => {
        const seat = courtyardStoneSeats[seatIndex],
          outward = courtyardStoneSeatOutwardDirections[seatIndex],
          tangent = new THREE.Vector3(-outward.z, 0, outward.x),
          relative = point.clone().sub(seat).setY(0),
          outwardDistance = relative.dot(outward),
          lateralDistance = Math.abs(relative.dot(tangent));
        return (
          outwardDistance >= -0.08 &&
          outwardDistance <= 1.36 &&
          lateralDistance <= 0.42
        );
      },
      courtyardStoneSeatIvParkPoint = (seatIndex: number) => {
        const seat = courtyardStoneSeats[seatIndex];
        return new THREE.Vector3(
          seat.x - Math.sign(seat.x || 1) * 0.24,
          courtyardPatientGroundY,
          seat.z < 3.48 ? 2.82 : 4.14,
        );
      },
      lyingPose = (slot: WardBedSlot) => {
        const poseY = slot.out.clone().normalize(),
          poseZ = new THREE.Vector3(0, -1, 0),
          poseX = poseY.clone().cross(poseZ).normalize(),
          matrix = new THREE.Matrix4().makeBasis(poseX, poseY, poseZ);
        return {
          position: slot.bedCentre
            .clone()
            .addScaledVector(slot.out, -0.72)
            .setY(1.06),
          quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
          scale: new THREE.Vector3(0.792, 0.792, 0.792),
        };
      },
      // Patients mount and leave the mattress from the IV side, then follow
      // that clear bedside aisle toward the foot before turning to the door.
      bedExitPoint = (slot: WardBedSlot) =>
        slot.bedCentre
          .clone()
          .addScaledVector(slot.bedSide, slot.cabinetSide * -1.04)
          .addScaledVector(slot.out, -0.22)
          .setY(0),
      bedAislePoint = (slot: WardBedSlot) =>
        slot.bedCentre
          .clone()
          .addScaledVector(slot.bedSide, slot.cabinetSide * -1.28)
          .addScaledVector(slot.out, -1.38)
          .setY(0),
      roomInsidePoint = (slot: WardBedSlot) =>
        slot.doorCentre.clone().addScaledVector(slot.out, 0.86).setY(0),
      roomOutsidePoint = (slot: WardBedSlot) =>
        slot.doorCentre.clone().addScaledVector(slot.out, -0.92).setY(0),
      patientCourtyardQueue = new THREE.Vector3(0, 0, -1.58),
      courtyardDoorCentres = [
        northCourtyardDoor.clone(),
        westDoorCentre.clone(),
        eastDoorCentre.clone(),
      ],
      courtyardCentreReference = new THREE.Vector3(0, 0, 3.48),
      // The patient body and left-hand IV stand both fit between the upper
      // and lower stone boundaries at this surveyed east-west centreline.
      courtyardEastWestLaneZ = 3.36,
      // Clockwise order viewed from above: north, east, south, west. Every
      // courtyard route joins this ring instead of cutting across the centre.
      courtyardRoundaboutRing = [
        new THREE.Vector3(0, 0, 2.05),
        new THREE.Vector3(1.43, 0, 3.48),
        new THREE.Vector3(0, 0, 4.91),
        new THREE.Vector3(-1.43, 0, 3.48),
      ],
      courtyardClockwiseArc = (fromIndex: number, toIndex: number) => {
        const points: THREE.Vector3[] = [],
          count = courtyardRoundaboutRing.length;
        let index = ((fromIndex % count) + count) % count;
        points.push(courtyardRoundaboutRing[index].clone());
        while (index !== toIndex) {
          index = (index + 1) % count;
          points.push(courtyardRoundaboutRing[index].clone());
        }
        return points;
      },
      courtyardDoorInsidePoints = courtyardDoorCentres.map((centre, index) =>
        index === 0
          ? northCourtyardInside.clone()
          : centre
              .clone()
              .add(
                courtyardCentreReference
                  .clone()
                  .sub(centre)
                  .setY(0)
                  .normalize()
                  .multiplyScalar(0.92),
              ),
      ),
      courtyardDoorOutsidePoints = courtyardDoorCentres.map((centre, index) =>
        index === 0
          ? patientCourtyardQueue.clone()
          : centre
              .clone()
              .add(
                centre
                  .clone()
                  .sub(courtyardCentreReference)
                  .setY(0)
                  .normalize()
                  .multiplyScalar(0.92),
              ),
      ),
      courtyardDoorLaneOffset = 0.5,
      courtyardDoorLanePoint = (
        doorIndex: 0 | 1 | 2,
        location: "outside" | "threshold" | "inside",
        entering: boolean,
      ) => {
        const centre = courtyardDoorCentres[doorIndex],
          inward = courtyardDoorInsidePoints[doorIndex]
            .clone()
            .sub(centre)
            .setY(0)
            .normalize(),
          travel = entering ? inward : inward.clone().multiplyScalar(-1),
          right = new THREE.Vector3(-travel.z, 0, travel.x),
          base =
            location === "outside"
              ? courtyardDoorOutsidePoints[doorIndex]
              : location === "inside"
                ? courtyardDoorInsidePoints[doorIndex]
                : centre;
        return base
          .clone()
          .addScaledVector(right, courtyardDoorLaneOffset)
          .setY(0);
      },
      courtyardDoorLaneThresholds = ([0, 1, 2] as const).flatMap(
        (doorIndex) => [
          courtyardDoorLanePoint(doorIndex, "threshold", true),
          courtyardDoorLanePoint(doorIndex, "threshold", false),
        ],
      ),
      // Keep the whole north entrance arm straight. Inbound and outbound
      // patients stay on separate right-hand lines until they are well clear
      // of the doorway, then merge with the roundabout away from the leaves.
      courtyardNorthEntryRelease = new THREE.Vector3(
        courtyardDoorLanePoint(0, "inside", true).x,
        0,
        1.72,
      ),
      courtyardNorthExitRelease = new THREE.Vector3(
        courtyardDoorLanePoint(0, "inside", false).x,
        0,
        1.72,
      ),
      courtyardGateToNorthRoute = (
        doorIndex: 0 | 1 | 2,
        entering = true,
      ) => {
        const laneInside = courtyardDoorLanePoint(
          doorIndex,
          "inside",
          entering,
        );
        if (doorIndex === 0)
          return [laneInside, courtyardNorthEntryRelease.clone()];
        const side = doorIndex === 1 ? -1 : 1,
          sideRingIndex = doorIndex === 1 ? 3 : 1;
        return courtyardRightLaneRoute([
          laneInside,
          new THREE.Vector3(side * 3.72, 0, courtyardEastWestLaneZ),
          ...courtyardClockwiseArc(sideRingIndex, 0),
          courtyardNorthEntryRelease.clone(),
        ]);
      },
      courtyardNorthToGateRoute = (
        doorIndex: 0 | 1 | 2,
        entering = false,
      ) => {
        const laneInside = courtyardDoorLanePoint(
          doorIndex,
          "inside",
          entering,
        );
        if (doorIndex === 0)
          return [courtyardNorthExitRelease.clone(), laneInside];
        const side = doorIndex === 1 ? -1 : 1,
          sideRingIndex = doorIndex === 1 ? 3 : 1;
        return courtyardRightLaneRoute([
          courtyardNorthExitRelease.clone(),
          ...courtyardClockwiseArc(0, sideRingIndex),
          new THREE.Vector3(side * 3.72, 0, courtyardEastWestLaneZ),
          laneInside,
        ]);
      },
      // Patients and nurses share two persistent right-hand lanes in the
      // public ward corridor: eastbound traffic uses the southern lane and
      // westbound traffic uses the northern lane.
      wardCorridorLaneZ = (eastbound: boolean) =>
        eastbound ? -1.94 : -3.42,
      // A medical cart needs more turning depth than a walking patient. Keep
      // every cross-building nurse segment on one straight line well north of
      // the courtyard entrance; turns occur only at the station merge or the
      // selected ward branch.
      wardNurseCorridorZ = -3.42,
      patientRoomCorridorPath = (
        slot: WardBedSlot,
        enteringCourtyard: boolean,
      ) => {
        const eastbound = enteringCourtyard
            ? slot.room === 1
            : slot.room !== 1,
          laneZ = wardCorridorLaneZ(eastbound);
        if (slot.room === 1)
          return [
            new THREE.Vector3(-5.82, 0, -2.92),
            new THREE.Vector3(-4.18, 0, laneZ),
            new THREE.Vector3(0, 0, laneZ),
          ];
        if (slot.room === 2)
          return [
            new THREE.Vector3(5.82, 0, -2.94),
            new THREE.Vector3(4.18, 0, laneZ),
            new THREE.Vector3(0, 0, laneZ),
          ];
        // Ward 3 sits beyond the angled east courtyard glass. Follow the
        // exterior edge northward before entering the central patient lane.
        return [
          new THREE.Vector3(10.92, 0, 2.52),
          new THREE.Vector3(9.18, 0, 0.18),
          new THREE.Vector3(7.16, 0, -1.86),
          new THREE.Vector3(4.24, 0, laneZ),
          new THREE.Vector3(0, 0, laneZ),
        ];
      },
      patientRoomToCourtyardDoorPath = (
        slot: WardBedSlot,
        doorIndex: 0 | 1 | 2,
        entering = true,
      ) => {
        const laneOutside = courtyardDoorLanePoint(
          doorIndex,
          "outside",
          entering,
        );
        if (doorIndex === 0)
          return patientRoomCorridorPath(slot, entering).concat(
            laneOutside,
          );
        if (doorIndex === 1 && slot.room === 1) {
          const outward = westDoorCentre
            .clone()
            .sub(courtyardCentreReference)
            .setY(0)
            .normalize();
          return [
            new THREE.Vector3(-5.82, 0, -2.92),
            new THREE.Vector3(-6.18, 0, -1.88),
            courtyardNorthWest.clone().addScaledVector(outward, 0.92),
            laneOutside,
          ];
        }
        if (doorIndex === 2 && slot.room >= 2) {
          const outward = eastDoorCentre
            .clone()
            .sub(courtyardCentreReference)
            .setY(0)
            .normalize();
          return slot.room === 2
            ? [
                new THREE.Vector3(5.82, 0, -2.94),
                new THREE.Vector3(6.18, 0, -1.88),
                courtyardNorthEast.clone().addScaledVector(outward, 0.92),
                laneOutside,
              ]
            : [
                new THREE.Vector3(10.92, 0, 2.52),
                laneOutside,
              ];
        }
        return patientRoomCorridorPath(slot, entering).concat(
          courtyardDoorLanePoint(0, "outside", entering),
        );
      },
      nurseRoomCorridorPath = (
        slot: WardBedSlot,
        eastbound: boolean,
      ) => {
        // The public corridor owns permanent directional lanes. Nurses and
        // their carts select the right-hand lane when the route is created,
        // never as a reaction after another actor is already close.
        const laneZ = wardCorridorLaneZ(eastbound);
        if (slot.room === 1)
          return [
            new THREE.Vector3(-5.74, 0, -3.08),
            new THREE.Vector3(-4.18, 0, laneZ),
            new THREE.Vector3(0, 0, laneZ),
          ];
        if (slot.room === 2)
          return [
            new THREE.Vector3(5.74, 0, -3.1),
            new THREE.Vector3(4.18, 0, laneZ),
            new THREE.Vector3(0, 0, laneZ),
          ];
        return [
          new THREE.Vector3(11.08, 0, 2.42),
          new THREE.Vector3(9.42, 0, 0.08),
          new THREE.Vector3(7.36, 0, -1.96),
          new THREE.Vector3(5.18, 0, laneZ),
          new THREE.Vector3(0, 0, laneZ),
        ];
      },
      patientOutboundRoute = (
        slot: WardBedSlot,
        destination: THREE.Vector3,
        doorIndex: 0 | 1 | 2 = 0,
      ) => [
        bedExitPoint(slot),
        bedAislePoint(slot),
        roomInsidePoint(slot),
        slot.doorCentre.clone().setY(0),
        roomOutsidePoint(slot),
        ...patientRoomToCourtyardDoorPath(slot, doorIndex, true),
        courtyardDoorLanePoint(doorIndex, "threshold", true),
        ...courtyardGateToNorthRoute(doorIndex, true),
        destination.clone().setY(0),
      ],
      patientHomeTail = (
        slot: WardBedSlot,
        doorIndex: 0 | 1 | 2 = 0,
      ) => [
        courtyardNorthExitRelease.clone(),
        ...courtyardNorthToGateRoute(doorIndex, false).slice(1),
        courtyardDoorLanePoint(doorIndex, "threshold", false),
        ...patientRoomToCourtyardDoorPath(slot, doorIndex, false).reverse(),
        roomOutsidePoint(slot),
        slot.doorCentre.clone().setY(0),
        roomInsidePoint(slot),
        bedAislePoint(slot),
        bedExitPoint(slot),
      ],
      resetWardWalkerPose = (walker: Walker) => {
        walker.group.scale.setScalar(thirdFloorContentScale);
        walker.legs.forEach((leg, index) => {
          leg.position.set(index ? 0.13 : -0.13, 0.31, 0);
          leg.rotation.set(0, 0, 0);
        });
        walker.arms.forEach((arm, index) => {
          arm.position.set(index ? 0.36 : -0.36, 1.18, 0);
          arm.rotation.set(0, 0, 0);
        });
        walker.headRig.rotation.set(0, 0, 0);
        walker.group.children.forEach((part) => {
          if (part.userData.uniformPart && Math.abs(part.position.x) < 0.05)
            part.scale.set(1, 1, 1);
        });
      },
      resetInpatientGown = (gown: THREE.Mesh) => {
        gown.position.set(0, 0.84, -0.015);
        gown.scale.set(1, 1, 1);
      },
      setWardWalkerLyingLimbs = (walker: Walker) => {
        walker.legs.forEach((leg, index) => {
          leg.position.set(index ? 0.13 : -0.13, 0.31, 0);
          leg.rotation.set(0, 0, 0);
        });
        walker.arms.forEach((arm) => arm.rotation.set(0, 0, 0));
      },
      setWardWalkerSeatedLegs = (walker: Walker) => {
        walker.legs.forEach((leg, index) => {
          leg.position.set(index ? 0.14 : -0.14, 0.69, -0.3);
          leg.rotation.set(-Math.PI / 2, 0, 0);
        });
      },
      setWardWalkerStanding = (walker: Walker, yaw?: number) => {
        const nextYaw = yaw ?? walker.group.rotation.y;
        walker.group.position.y = 0;
        walker.group.quaternion.setFromEuler(new THREE.Euler(0, nextYaw, 0));
        resetWardWalkerPose(walker);
      },
      setWardWalkerSeated = (walker: Walker, yaw: number, y = 0.14) => {
        walker.group.position.y = y;
        walker.group.scale.set(0.828, 0.792, 0.828);
        walker.group.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
        setWardWalkerSeatedLegs(walker);
      },
      wardBedSeatPose = (slot: WardBedSlot) => {
        const position = slot.bedCentre
            .clone()
            // Keep the torso close enough to use the tray without intersecting
            // the tabletop's inner edge.
            .addScaledVector(slot.out, -0.24)
            .setY(0.58),
          tablePoint = slot.bedCentre
            .clone()
            .addScaledVector(slot.out, -1.02);
        return {
          position,
          quaternion: new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, thirdFloorYaw(position, tablePoint), 0),
          ),
          scale: new THREE.Vector3(0.828, 0.792, 0.828),
        };
      },
      inpatientBedIvParkPoint = (slot: WardBedSlot) =>
        slot.bedCentre
          .clone()
          .addScaledVector(slot.bedSide, slot.cabinetSide * -1.02)
          .addScaledVector(slot.out, 0.82)
          .setY(0);

    // One fresh seed is created when the floor scene is entered. It keeps the
    // opening assignment stable for this scene instance, while a later visit
    // receives a different patient order instead of replaying bed indexes.
    let careRandomState =
        (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0,
      inpatientActivitySequence = 0,
      // One patient is already seated at scene start. Every subsequent
      // patient departure must wait three seconds after the previous one.
      patientDepartureCooldown = 3;
    const careRandom = () => {
        careRandomState += 0x6d2b79f5;
        let value = careRandomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      },
      initialPatientOrder = wardBedSlots.map((_, index) => index);
    for (let index = initialPatientOrder.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(careRandom() * (index + 1));
      [initialPatientOrder[index], initialPatientOrder[swapIndex]] = [
        initialPatientOrder[swapIndex],
        initialPatientOrder[index],
      ];
    }
    const initialPatientRank = new Map(
        initialPatientOrder.map((patientIndex, rank) => [patientIndex, rank]),
      ),
      initialActivityWaveOffset = Math.floor(careRandom() * 4),
      initialSeatedPatientIndex = initialPatientOrder[0] ?? 0,
      initialInspectionNurseIndex = Math.floor(careRandom() * 3),
      initialInspectionDelay = 7 + careRandom() * 5;

    const inpatientPatients: InpatientActor[] = wardBedSlots.map(
      (slot, index) => {
        const gownColors = [
            0xa9d6df,
            0xc0d9cc,
            0xd5c3da,
            0xaecbdc,
            0xd9c8b8,
            0xb8d7d2,
            0xc5cce1,
            0xd7c3ca,
          ],
          gender: Gender = index % 3 === 1 ? "male" : "female",
          walker = person(
            thirdFloor,
            "patient",
            gownColors[index % gownColors.length],
            slot.bedCentre.clone(),
            [slot.bedCentre.clone()],
            inpatientWalkSpeed,
            slot.room,
            gender,
            330 + index,
          );
        walker.group.userData.floor = 3;
        walker.group.userData.inpatientIndex = index;
        walker.group.userData.inpatient = true;
        walker.group.userData.assignedBed = `${slot.room}-${slot.index + 1}`;
        if (walker.phone) walker.phone.visible = false;
        if (walker.medicineBag) walker.medicineBag.visible = false;
        walker.group.traverse((object) => {
          object.userData.hitRoot = walker.group;
          interactive.push(object);
          if (
            object instanceof THREE.Mesh &&
            object.userData.uniformPart &&
            object.material instanceof THREE.MeshStandardMaterial
          )
            object.material.color.setHex(gownColors[index % gownColors.length]);
        });
        const gown = new THREE.Mesh(
          new RoundedBoxGeometry(0.64, 0.7, 0.34, 7, 0.12),
          material(gownColors[index % gownColors.length], 0.68),
        );
        gown.position.set(0, 0.84, -0.015);
        gown.castShadow = true;
        walker.group.add(gown);
        walker.legs.forEach((leg) => {
          if (leg.material instanceof THREE.MeshStandardMaterial)
            leg.material.color.setHex(0xe6efed);
        });
        const bracelet = new THREE.Mesh(
          new THREE.TorusGeometry(0.078, 0.014, 7, 14),
          material(0xffffff, 0.5),
        );
        bracelet.rotation.x = Math.PI / 2;
        bracelet.position.set(0, -0.42, 0);
        walker.arms[1].add(bracelet);

        const tray = new THREE.Group(),
          trayBase = new THREE.Mesh(
            new RoundedBoxGeometry(0.5, 0.045, 0.78, 5, 0.05),
            material(0xf5eee1, 0.58),
          ),
          plate = cyl(0.15, 0.025, 0xffffff, 20),
          bowl = cyl(0.1, 0.07, 0xc3dce0, 16),
          cup = cyl(0.055, 0.12, 0xe8c783, 14);
        trayBase.position.y = 0;
        plate.position.set(-0.1, 0.045, 0.08);
        bowl.position.set(0.12, 0.07, -0.18);
        cup.position.set(0.12, 0.09, 0.24);
        tray.add(trayBase, plate, bowl, cup);
        tray.position.set(0, 1.2, 0);
        tray.visible = false;
        slot.overbed.add(tray);

        const medicationPill = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.044, 0.088, 6, 12),
          new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x780000,
            emissiveIntensity: 0.24,
            roughness: 0.34,
          }),
        );
        medicationPill.rotation.z = Math.PI / 2;
        medicationPill.position.set(0, -0.082, -0.032);
        medicationPill.visible = false;
        walker.hands[1].add(medicationPill);

        const lie = lyingPose(slot),
          ivHome = inpatientBedIvParkPoint(slot),
          actor: InpatientActor = {
            walker,
            slot,
            gown,
            tray,
            state: "bedRest",
            timer:
              3 + (initialPatientRank.get(index) ?? index) * 3,
            route: [],
            waypoint: 0,
            arrival: "bedRest",
            activityPriority: initialPatientRank.get(index) ?? index,
            lastActivitySequence:
              (initialPatientRank.get(index) ?? index) - wardBedSlots.length,
            inspectionReserved: false,
            pausedCourtyardRest: 0,
            conversationVisitor: false,
            blockedTime: 0,
            avoidanceDetourActive: false,
            avoidanceAttempt: 0,
            courtyardTrafficWait: 0,
            motionStallTime: 0,
            motionWatchPosition: lie.position.clone(),
            doorPassOverride: 0,
            transitionFromPosition: lie.position.clone(),
            transitionFromQuaternion: lie.quaternion.clone(),
            transitionFromScale: lie.scale.clone(),
            transitionToPosition: lie.position.clone(),
            transitionToQuaternion: lie.quaternion.clone(),
            transitionToScale: lie.scale.clone(),
            transitionStartsSeated: false,
            ivParkPosition: ivHome.clone(),
            ivTransitionFromPosition: ivHome.clone(),
            postInspectionCooldown: 0,
            medicationReserved: false,
            medicationPill,
          };
        walker.group.position.copy(lie.position);
        walker.group.quaternion.copy(lie.quaternion);
        walker.group.scale.copy(lie.scale);
        slot.ivStand.position.copy(ivHome);
        return actor;
      },
    );

    const wardNurseSeatPoints = [-2.15, 0, 2.15].map(
        // The 90%-scale chair centre is at z=-6.352 and its backrest front
        // face is near z=-6.186. Moving the torso slightly toward the desk
        // keeps the seated body on the cushion without entering the backrest.
        (x) => new THREE.Vector3(x, 0.14, -6.42),
      ),
      outerWardMedicalCart = thirdFloorMedicalCarts[0],
      outerWardMedicalCartHome = outerWardMedicalCart.position.clone(),
      wardNurses: WardNurseActor[] = [0, 1, 2].map((index) => {
      const startPoint = wardNurseSeatPoints[index],
        walker = person(
          thirdFloor,
          "nurse",
          [0x77b9c8, 0x72b7aa, 0x83aec7][index],
          startPoint,
          [startPoint.clone()],
          wardNurseWalkSpeed,
          30 + index,
          index === 1 ? "male" : "female",
          410 + index,
        );
      walker.group.userData.floor = 3;
      walker.group.userData.wardNurseIndex = index;
      walker.group.userData.wardNurse = true;
      walker.headRig.traverse((object) => {
        if (object.userData.nurseCapPart) object.visible = false;
      });
      walker.group.traverse((object) => {
        object.userData.hitRoot = walker.group;
        interactive.push(object);
      });
      if (walker.chart) walker.chart.visible = false;
      setWardWalkerSeated(walker, 0, 0.14);
      return {
        walker,
        index,
        cart: outerWardMedicalCart,
        cartHome: outerWardMedicalCartHome.clone(),
        mode: "station",
        route: [],
        waypoint: 0,
        cartAttachWaypoint: -1,
        cartAttached: false,
        cartParked: false,
        reverseWaypoint: -1,
        timer: 0,
        blockedTime: 0,
        motionStallTime: 0,
        motionWatchPosition: startPoint.clone(),
        navigationOverride: 0,
      };
      });

    // Compact autonomous medication cabinet: a tall wheeled refrigerator form
    // with a top display and a single front dispensing door. It waits in the
    // nursing-station upper-right corner and always faces its next waypoint.
    const medicationRobotHome = new THREE.Vector3(3.84, 0, -7.62),
      medicationRobotGroup = new THREE.Group(),
      medicationRobotBody = new THREE.Mesh(
        new RoundedBoxGeometry(0.96, 1.52, 0.76, 8, 0.14),
        material(0xeaf1ef, 0.48),
      ),
      medicationRobotDoor = new THREE.Mesh(
        new RoundedBoxGeometry(0.72, 0.72, 0.055, 7, 0.08),
        material(0x8fbfca, 0.5),
      ),
      medicationRobotDoorPivot = new THREE.Group(),
      medicationRobotCabinetInterior = new THREE.Group(),
      medicationRobotScreenHousing = new THREE.Mesh(
        new RoundedBoxGeometry(0.66, 0.42, 0.16, 7, 0.09),
        material(0x456d7c, 0.38),
      ),
      medicationRobotScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.28),
        new THREE.MeshStandardMaterial({
          color: 0x899497,
          emissive: 0x343c3e,
          emissiveIntensity: 0.16,
          roughness: 0.32,
        }),
      ),
      medicationRobotWheels: THREE.Mesh[] = [];
    medicationRobotBody.position.y = 0.87;
    // Keep the door in front of the recessed cabinet and hinge it on the left
    // edge. A positive Y rotation sends the panel out from the robot's front.
    medicationRobotDoorPivot.position.set(-0.36, 1.08, -0.525);
    medicationRobotDoor.position.set(0.36, 0, 0);
    medicationRobotScreenHousing.position.set(0, 1.79, -0.08);
    medicationRobotScreen.position.set(0, 1.79, -0.166);
    medicationRobotScreen.rotation.y = Math.PI;
    medicationRobotGroup.add(
      medicationRobotBody,
      medicationRobotCabinetInterior,
      medicationRobotDoorPivot,
      medicationRobotScreenHousing,
      medicationRobotScreen,
    );
    const cabinetBack = new THREE.Mesh(
        new RoundedBoxGeometry(0.64, 0.64, 0.035, 5, 0.055),
        material(0x365762, 0.72),
      ),
      cabinetLeftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.64, 0.14),
        material(0xd2e4e3, 0.62),
      ),
      cabinetRightWall = cabinetLeftWall.clone(),
      cabinetTopWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.64, 0.045, 0.14),
        material(0xd2e4e3, 0.62),
      ),
      cabinetBottomWall = cabinetTopWall.clone(),
      cabinetShelf = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.035, 0.12),
        material(0xaacbcd, 0.58),
      );
    cabinetBack.position.set(0, 1.08, -0.397);
    cabinetLeftWall.position.set(-0.32, 1.08, -0.46);
    cabinetRightWall.position.set(0.32, 1.08, -0.46);
    cabinetTopWall.position.set(0, 1.4, -0.46);
    cabinetBottomWall.position.set(0, 0.76, -0.46);
    cabinetShelf.position.set(0, 1.02, -0.475);
    medicationRobotCabinetInterior.add(
      cabinetBack,
      cabinetLeftWall,
      cabinetRightWall,
      cabinetTopWall,
      cabinetBottomWall,
      cabinetShelf,
    );
    medicationRobotDoorPivot.add(medicationRobotDoor);
    const medicationDoorHandle = cyl(0.035, 0.28, 0x59737d, 12);
    medicationDoorHandle.rotation.z = Math.PI / 2;
    medicationDoorHandle.position.set(0.58, 0.12, -0.045);
    medicationRobotDoorPivot.add(medicationDoorHandle);
    [-0.33, 0.33].forEach((x) =>
      [-0.25, 0.25].forEach((z) => {
        const wheel = cyl(0.09, 0.07, 0x4d5f67, 14);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.09, z);
        medicationRobotWheels.push(wheel);
        medicationRobotGroup.add(wheel);
      }),
    );
    medicationRobotGroup.position.copy(medicationRobotHome);
    medicationRobotGroup.rotation.y = Math.PI;
    medicationRobotGroup.scale.setScalar(thirdFloorContentScale);
    medicationRobotGroup.userData = {
      interactive: "medicationRobot",
      medicationRobot: true,
      floor: 3,
    };
    medicationRobotGroup.traverse((object) => {
      object.userData.hitRoot = medicationRobotGroup;
      object.userData.floor = 3;
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        interactive.push(object);
      }
    });
    thirdFloor.add(medicationRobotGroup);
    const medicationRobot: MedicationRobotActor = {
      group: medicationRobotGroup,
      home: medicationRobotHome.clone(),
      mode: "home",
      route: [],
      waypoint: 0,
      timer: 0,
      wheelPhase: 0,
      doorOpenAmount: 0,
      departureStaging: false,
    };

    const inpatientIvPalmFloorPoint = (actor: InpatientActor) => {
      thirdFloor.updateWorldMatrix(true, false);
      actor.walker.group.updateWorldMatrix(true, true);
      const palmWorld = actor.walker.hands[0].getWorldPosition(
        new THREE.Vector3(),
      );
      const localPalm = thirdFloor.worldToLocal(palmWorld);
      return localPalm.setY(
        courtyardPatientGroundYAt(actor.walker.group.position),
      );
    };

    const placeWardNursePalmsOnCart = (nurse: WardNurseActor) => {
      if (!nurse.cartAttached || nurse.cartParked) return;
      thirdFloor.updateWorldMatrix(true, false);
      nurse.cart.updateWorldMatrix(true, true);
      nurse.walker.group.updateWorldMatrix(true, true);
      nurse.walker.arms.forEach((arm, armIndex) => {
        // The two targets sit on the rear edge of the cart top. The palms are
        // slightly larger than the gap to the upper rail, so both visibly make
        // contact while the nurse turns, advances, or reverses with the cart.
        const gripWorld = nurse.cart.localToWorld(
            new THREE.Vector3(armIndex === 0 ? -0.24 : 0.24, 1.18, 0.39),
          ),
          gripInNurse = nurse.walker.group.worldToLocal(gripWorld),
          armDirection = gripInNurse.sub(arm.position).normalize();
        arm.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, -1, 0),
          armDirection,
        );
      });
    };

    const courtyardHalfWidthAt = (z: number) => {
        const depthProgress = THREE.MathUtils.clamp(
            (z + 1.08) / 8.78,
            0,
            1,
          );
        return THREE.MathUtils.lerp(5.56, courtyardFacadeHalf, depthProgress);
      },
      isInsideCourtyardFootprint = (point: THREE.Vector3) => {
        if (point.z < -1.08 || point.z > 7.7) return false;
        return Math.abs(point.x) < courtyardHalfWidthAt(point.z) - 0.16;
      },
      isNurseClearOfCourtyardGlass = (
        point: THREE.Vector3,
        clearance = 0.72,
      ) => {
        if (point.z <= -1.08 - clearance || point.z >= 7.7 + clearance)
          return true;
        return Math.abs(point.x) >= courtyardHalfWidthAt(point.z) + clearance;
      },
      isCourtyardWalkwayPoint = (point: THREE.Vector3) => {
        if (!isInsideCourtyardFootprint(point)) return false;
        const verticalArm =
            Math.abs(point.x) <= 1.16 &&
            point.z >= -1.18 &&
            point.z <= 7.58,
          horizontalArm =
            Math.abs(point.z - 3.48) <= 1.07 &&
            Math.abs(point.x) <= courtyardHalfWidthAt(point.z) - 0.35,
          centralCircle = Math.hypot(point.x, point.z - 3.48) <= 2,
          stoneSeatAccess = courtyardStoneSeats.some((seat, seatIndex) => {
            const outward = courtyardStoneSeatOutwardDirections[seatIndex],
              tangent = new THREE.Vector3(-outward.z, 0, outward.x),
              relative = point.clone().sub(seat).setY(0),
              outwardDistance = relative.dot(outward),
              lateralDistance = Math.abs(relative.dot(tangent));
            // Only the promenade-facing side is open. A continuous 1.45 m
            // apron reaches the real walkway, while the planting-bed side
            // remains invalid for both the patient and IV stand.
            return (
              outwardDistance >= -0.08 &&
              outwardDistance <= 1.45 &&
              lateralDistance <= 0.5
            );
          });
        return verticalArm || horizontalArm || centralCircle || stoneSeatAccess;
      },
      courtyardStoneSeatStepIsForbidden = (
        actor: InpatientActor,
        point: THREE.Vector3,
      ) => {
        const assignedSeatIndex =
            actor.arrival === "courtyardSit" &&
            actor.assignedCourtyardSeat !== undefined
              ? actor.assignedCourtyardSeat
              : -1,
          departureSeatIndex = Number(
            actor.walker.group.userData.courtyardSeatExitIndex ?? -1,
          );
        return courtyardStoneSeatBases.some((base, benchIndex) => {
          const outward = courtyardStoneSeatOutwardDirections[benchIndex * 2],
            tangent = new THREE.Vector3(-outward.z, 0, outward.x),
            relative = point.clone().sub(base).setY(0),
            outwardDistance = relative.dot(outward),
            lateralDistance = Math.abs(relative.dot(tangent));
          // The physical two-person stone cap is about two metres wide. The
          // previous 1.34 m half-width made the upper and lower exclusion
          // envelopes overlap across the east-west promenade, leaving no
          // body-width route even though the visible walkway is open.
          if (outwardDistance >= 0.34 || lateralDistance >= 1)
            return false;
          const permittedSeatIndex =
            Math.floor(assignedSeatIndex / 2) === benchIndex
              ? assignedSeatIndex
              : actor.walker.group.userData.leavingCourtyardSeat === true &&
                  Math.floor(departureSeatIndex / 2) === benchIndex
                ? departureSeatIndex
                : -1;
          if (permittedSeatIndex < 0) return true;
          const seat = courtyardStoneSeats[permittedSeatIndex],
            channelRelative = point.clone().sub(seat).setY(0),
            channelOutward = channelRelative.dot(outward),
            channelLateral = Math.abs(channelRelative.dot(tangent));
          // The only opening through a stone boundary is a narrow straight
          // channel centred on the actor's own seat. The adjacent cap and the
          // rest of the same bench stay forbidden.
          return channelOutward < -0.08 || channelLateral > 0.42;
        });
      },
      // Use the widened promenade all the way to the stone-seat edge. A
      // right-hand offset is useful only on the unobstructed north arm. The
      // east-west arm passes between four stone-seat/planting boundaries, so
      // its surveyed centreline must remain untouched; offsetting those
      // waypoints makes the connecting segment cut through a bench exclusion
      // zone even when both endpoints look valid.
      courtyardRightLaneOffset = 0.78,
      courtyardRightLaneRoute = (points: THREE.Vector3[]) =>
        points.map((point, index) => {
          if (index === 0 || index === points.length - 1)
            return point.clone().setY(0);
          if (Math.abs(point.x) > 1.2)
            return point.clone().setY(0);
          // The central plaza is already a clockwise one-way roundabout. Keep
          // its enlarged ring intact and reserve right-lane offsets for the
          // bidirectional straight arms where opposing patients must pass.
          if (
            Math.hypot(
              point.x - courtyardCentreReference.x,
              point.z - courtyardCentreReference.z,
            ) < 2.08
          )
            return point.clone().setY(0);
          const previous = points[index - 1],
            next = points[index + 1],
            direction = next.clone().sub(previous).setY(0);
          if (direction.lengthSq() < 0.001) return point.clone().setY(0);
          direction.normalize();
          // Local right side for a +Z traveller is -X. The IV stand is never
          // flipped to an artificial inside position: its live palm offset
          // follows the holding hand and the patient's facing direction.
          const right = new THREE.Vector3(-direction.z, 0, direction.x),
            candidate = point
              .clone()
              .addScaledVector(right, courtyardRightLaneOffset)
              .setY(0);
          return isCourtyardWalkwayPoint(candidate)
            ? candidate
            : point.clone().setY(0);
        }),
      courtyardSafeRouteTo = (destination: THREE.Vector3) => {
        const side = Math.sign(destination.x) || 1,
          sideRingIndex = side < 0 ? 3 : 1,
          seatIndex = courtyardStoneSeats.findIndex(
            (seat) => actorHorizontalDistance(seat, destination) < 0.08,
          ),
          promenadeRoute = courtyardRightLaneRoute([
            courtyardNorthEntryRelease.clone(),
            ...courtyardClockwiseArc(0, sideRingIndex),
          ]);
        // The promenade-to-seat connection must begin at the side ring and
        // go directly to the seat's outward release point. The former pair of
        // axis-aligned approach points were individually valid, but their
        // connecting segment crossed the lower bench/flowerbed boundary.
        return seatIndex >= 0
          ? promenadeRoute.concat([
              courtyardStoneSeatExitPoint(seatIndex),
              destination.clone().setY(0),
            ])
          : promenadeRoute.concat(destination.clone().setY(0));
      },
      courtyardSafeReturnRouteFrom = (origin: THREE.Vector3) => {
        const side = Math.sign(origin.x) || 1,
          sideRingIndex = side < 0 ? 3 : 1;
        return courtyardRightLaneRoute([
          origin.clone().setY(0),
          ...courtyardClockwiseArc(sideRingIndex, 0),
          courtyardNorthExitRelease.clone(),
        ]);
      },
      courtyardSafeWalkLoop = () =>
        courtyardRightLaneRoute([
          courtyardNorthEntryRelease.clone(),
          new THREE.Vector3(0, 0, 1.72),
          courtyardRoundaboutRing[0].clone(),
          courtyardRoundaboutRing[1].clone(),
          courtyardRoundaboutRing[2].clone(),
          courtyardRoundaboutRing[3].clone(),
          courtyardRoundaboutRing[0].clone(),
          new THREE.Vector3(0, 0, 1.72),
          courtyardNorthExitRelease.clone(),
        ]);

    type ThirdFloorDoorDirection = -1 | 1;
    type ThirdFloorDoorReservation = {
      occupants: Set<string>;
      direction?: ThirdFloorDoorDirection;
    };
    type CourtyardDoorQueue = {
      queue: string[];
      directions: Map<string, ThirdFloorDoorDirection>;
    };
    const wardDoorCentres = wardSwingDoors.map(
        (_, doorIndex) =>
          wardBedSlots.find((slot) => slot.doorIndex === doorIndex)?.doorCentre ??
          new THREE.Vector3(99, 0, 99),
      ),
      wardDoorDirections = wardDoorCentres.map(
        (_, doorIndex) =>
          wardBedSlots.find((slot) => slot.doorIndex === doorIndex)?.out ??
          new THREE.Vector3(0, 0, 1),
      ),
      wardDoorReservations: ThirdFloorDoorReservation[] = wardDoorCentres.map(
        () => ({ occupants: new Set<string>() }),
      ),
      courtyardDoorQueues: CourtyardDoorQueue[] = courtyardDoorCentres.map(
        () => ({ queue: [], directions: new Map() }),
      ),
      courtyardDoorDirections = courtyardDoorCentres.map((centre, index) =>
        courtyardDoorInsidePoints[index]
          .clone()
          .sub(centre)
          .setY(0)
          .normalize(),
      ),
      wardDoorReservationRadius = 2.62,
      wardDoorReleaseRadius = 3.08,
      courtyardDoorQueueRadius = 3.65,
      courtyardDoorQueueReleaseRadius = 4.2,
      courtyardDoorQueueGap = 0.88,
      isCourtyardDoorPassagePoint = (point: THREE.Vector3) =>
        courtyardDoorCentres.some((centre, index) => {
          const relative = point.clone().sub(centre).setY(0),
            tangent = courtyardAutoDoors[index].tangent,
            inward = courtyardDoorDirections[index];
          return (
            Math.abs(relative.dot(tangent)) <= courtyardDoorOpening * 0.44 &&
            Math.abs(relative.dot(inward)) <= 1.18
          );
        }),
      courtyardPatientBodyOffsets = [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.28, 0, 0),
          new THREE.Vector3(-0.28, 0, 0),
          new THREE.Vector3(0, 0, 0.28),
          new THREE.Vector3(0, 0, -0.28),
        ],
      courtyardPatientBodyIsOnWalkway = (point: THREE.Vector3) =>
        courtyardPatientBodyOffsets.every((offset) => {
          const sample = point.clone().add(offset);
          return (
            isCourtyardWalkwayPoint(sample) ||
            isCourtyardDoorPassagePoint(sample)
          );
        }),
      courtyardPatientBodyAvoidsStoneSeats = (
        actor: InpatientActor,
        point: THREE.Vector3,
      ) =>
        courtyardPatientBodyOffsets.every(
          (offset) =>
            !courtyardStoneSeatStepIsForbidden(
              actor,
              point.clone().add(offset),
            ),
        ),
      courtyardPatientGroundY = 0.1,
      courtyardPatientGroundYAt = (point: THREE.Vector3) =>
        isInsideCourtyardFootprint(point) ||
        isCourtyardDoorPassagePoint(point)
          ? courtyardPatientGroundY
          : 0,
      thirdFloorActorPosition = (key: string) => {
        const [kind, rawIndex] = key.split(":"),
          index = Number(rawIndex);
        return kind === "p"
          ? inpatientPatients[index]?.walker.group.position
          : wardNurses[index]?.walker.group.position;
      },
      courtyardRoundaboutOccupants = new Set<string>(),
      releaseCourtyardRoundaboutForActor = (key: string) => {
        courtyardRoundaboutOccupants.delete(key);
      },
      releaseCourtyardRoundaboutReservations = () => {
        courtyardRoundaboutOccupants.forEach((key) => {
          const [kind, rawIndex] = key.split(":"),
            patient =
              kind === "p" ? inpatientPatients[Number(rawIndex)] : undefined,
            position = patient?.walker.group.position;
          if (
            !patient ||
            patient.state !== "walking" ||
            !position ||
            actorHorizontalDistance(position, courtyardCentreReference) > 2.42
          )
            courtyardRoundaboutOccupants.delete(key);
        });
      },
      reserveCourtyardRoundabout = (
        key: string,
        current: THREE.Vector3,
        proposed: THREE.Vector3,
      ) => {
        const nearest = Math.min(
          actorHorizontalDistance(current, courtyardCentreReference),
          actorHorizontalDistance(proposed, courtyardCentreReference),
        );
        // The roundabout is a visual one-way route, not a physical capacity
        // gate. Patients may overlap one another, so nobody waits for another
        // patient's reservation before continuing around the ring.
        if (nearest < 2.08) courtyardRoundaboutOccupants.add(key);
        return true;
      },
      releaseThirdFloorDoorReservations = () => {
        releaseCourtyardRoundaboutReservations();
        wardDoorReservations.forEach((reservation, index) => {
          reservation.occupants.forEach((occupant) => {
            const position = thirdFloorActorPosition(occupant);
            if (
              !position ||
              actorHorizontalDistance(position, wardDoorCentres[index]) >
                wardDoorReleaseRadius
            )
              reservation.occupants.delete(occupant);
          });
          if (reservation.occupants.size === 0)
            reservation.direction = undefined;
        });
        courtyardDoorQueues.forEach((doorQueue, index) => {
          const centre = courtyardDoorCentres[index],
            inward = courtyardDoorDirections[index];
          doorQueue.queue = doorQueue.queue.filter((occupant) => {
            const [kind, rawIndex] = occupant.split(":"),
              patient =
                kind === "p" ? inpatientPatients[Number(rawIndex)] : undefined,
              position = thirdFloorActorPosition(occupant),
              direction = doorQueue.directions.get(occupant);
            if (
              !patient ||
              patient.state !== "walking" ||
              !position ||
              !direction ||
              actorHorizontalDistance(position, centre) >
                courtyardDoorQueueReleaseRadius
            ) {
              doorQueue.directions.delete(occupant);
              return false;
            }
            // The head releases the door only after its body and IV stand have
            // cleared the leaf. The next queued patient can then advance in the
            // same frame without waiting for an opposite-direction batch lock.
            if (
              doorQueue.queue[0] === occupant &&
              position.clone().sub(centre).dot(inward) * direction > 0.95
            ) {
              doorQueue.directions.delete(occupant);
              return false;
            }
            return true;
          });
        });
      },
      thirdFloorDoorTravelDirection = (
        current: THREE.Vector3,
        proposed: THREE.Vector3,
        centre: THREE.Vector3,
        inward: THREE.Vector3,
      ): ThirdFloorDoorDirection => {
        const projectedMotion = proposed.clone().sub(current).dot(inward);
        if (Math.abs(projectedMotion) > 0.0005)
          return projectedMotion > 0 ? 1 : -1;
        return current.clone().sub(centre).dot(inward) < 0 ? 1 : -1;
      },
      reserveThirdFloorDoor = (
        key: string,
        direction: ThirdFloorDoorDirection,
        current: THREE.Vector3,
        proposed: THREE.Vector3,
        centre: THREE.Vector3,
        reservation: ThirdFloorDoorReservation,
        reservationRadius: number,
        companionCurrent?: THREE.Vector3,
        companionProposed?: THREE.Vector3,
      ) => {
        const distances = [
            actorHorizontalDistance(current, centre),
            actorHorizontalDistance(proposed, centre),
          ];
        if (companionCurrent)
          distances.push(actorHorizontalDistance(companionCurrent, centre));
        if (companionProposed)
          distances.push(actorHorizontalDistance(companionProposed, centre));
        const nearDoor = Math.min(...distances) < reservationRadius;
        if (!nearDoor) return true;
        if (reservation.occupants.has(key)) return true;
        if (reservation.occupants.size === 0) {
          reservation.direction = direction;
          reservation.occupants.add(key);
          return true;
        }
        // A same-direction group may flow through as one continuous batch.
        // Only an actor approaching from the opposite direction must wait for
        // the complete current batch (including IV stand/cart) to clear.
        if (reservation.direction === direction) {
          reservation.occupants.add(key);
          return true;
        }
        return false;
      },
      reserveCourtyardDoorQueue = (
        key: string,
        direction: ThirdFloorDoorDirection,
        current: THREE.Vector3,
        proposed: THREE.Vector3,
        centre: THREE.Vector3,
        doorQueue: CourtyardDoorQueue,
        companionCurrent?: THREE.Vector3,
        companionProposed?: THREE.Vector3,
      ) => {
        const distances = [
            actorHorizontalDistance(current, centre),
            actorHorizontalDistance(proposed, centre),
          ];
        if (companionCurrent)
          distances.push(actorHorizontalDistance(companionCurrent, centre));
        if (companionProposed)
          distances.push(actorHorizontalDistance(companionProposed, centre));
        const distance = Math.min(...distances);
        const inpatientIndex = key.startsWith("p:")
            ? Number.parseInt(key.slice(2), 10)
            : -1,
          patient =
            inpatientIndex >= 0 ? inpatientPatients[inpatientIndex] : undefined;
        // Patients do not physically collide with one another. Their fixed
        // right-hand door lanes and same-direction speed matching already
        // preserve visible spacing, so a queue lock here only makes unrelated
        // walkers stop at an equal radius from the east and west exits.
        if (patient) {
          patient.walker.group.userData.waitingForCourtyardDoor = false;
          return true;
        }
        if (distance >= courtyardDoorQueueRadius) {
          return true;
        }
        if (!doorQueue.queue.includes(key)) {
          doorQueue.queue.push(key);
          doorQueue.directions.set(key, direction);
        }
        const rank = doorQueue.queue.indexOf(key);
        if (rank <= 0) return true;
        // Followers may approach an explicit queue slot, but never share the
        // leader's threshold. As each head clears, every rank advances once.
        const holdDistance = Math.min(
          courtyardDoorQueueRadius - 0.08,
          1.05 + rank * courtyardDoorQueueGap,
        );
        const canAdvance = distance > holdDistance;
        return canAdvance;
      },
      canUseThirdFloorDoors = (
        key: string,
        current: THREE.Vector3,
        proposed: THREE.Vector3,
        includeCourtyard: boolean,
        companionCurrent?: THREE.Vector3,
        companionProposed?: THREE.Vector3,
      ) => {
        const inpatientIndex = key.startsWith("p:")
            ? Number.parseInt(key.slice(2), 10)
            : -1,
          inpatientActor =
            inpatientIndex >= 0 ? inpatientPatients[inpatientIndex] : undefined,
          nurseIndex = key.startsWith("n:")
            ? Number.parseInt(key.slice(2), 10)
            : -1,
          bypassThirdFloorQueue =
            (inpatientIndex >= 0 &&
              (inpatientPatients[inpatientIndex]?.doorPassOverride ?? 0) >
                0) ||
            (nurseIndex >= 0 &&
              (wardNurses[nurseIndex]?.navigationOverride ?? 0) > 0);
        for (let index = 0; index < wardDoorCentres.length; index++) {
          const wardDoorRouteWindow = inpatientActor
            ? inpatientActor.route
                .slice(
                  Math.max(0, inpatientActor.waypoint - 1),
                  inpatientActor.waypoint + 3,
                )
                .some(
                  (point) =>
                    actorHorizontalDistance(point, wardDoorCentres[index]) <
                    1.72,
                )
            : true;
          // A patient's route can legitimately cross only their own ward
          // door, and only while that door is present in the immediate route
          // window. Radial proximity to another room must never reserve or
          // block movement in the courtyard promenade.
          if (
            inpatientActor &&
            (index !== inpatientActor.slot.doorIndex || !wardDoorRouteWindow)
          )
            continue;
          const doorDistance = Math.min(
            actorHorizontalDistance(current, wardDoorCentres[index]),
            actorHorizontalDistance(proposed, wardDoorCentres[index]),
          );
          if (
            !bypassThirdFloorQueue &&
            !reserveThirdFloorDoor(
              key,
              thirdFloorDoorTravelDirection(
                current,
                proposed,
                wardDoorCentres[index],
                wardDoorDirections[index],
              ),
              current,
              proposed,
              wardDoorCentres[index],
              wardDoorReservations[index],
              wardDoorReservationRadius,
              companionCurrent,
              companionProposed,
            )
          )
            return false;
          if (doorDistance < 1.68) {
            wardSwingDoors[index].openTarget = 1;
            if (
              doorDistance < 0.98 &&
              wardSwingDoors[index].openAmount < 0.76
            )
              return false;
          }
        }
        if (!includeCourtyard) return true;
        const patientDoorTransit = inpatientIndex >= 0,
          patientCourtyardDoorIndex = patientDoorTransit
            ? (inpatientPatients[inpatientIndex]?.assignedCourtyardDoor ?? 0)
            : -1;
        for (let index = 0; index < courtyardDoorCentres.length; index++) {
          // A patient walking past either side exit is unrelated to that door.
          // Only the doorway assigned to this trip may open or participate in
          // transit checks.
          if (patientDoorTransit && index !== patientCourtyardDoorIndex)
            continue;
          const courtyardDoorRouteWindow = inpatientActor
            ? inpatientActor.route
                .slice(
                  Math.max(0, inpatientActor.waypoint - 1),
                  inpatientActor.waypoint + 3,
                )
                .some(
                  (point) =>
                    actorHorizontalDistance(point, courtyardDoorCentres[index]) <
                    1.72,
                )
            : true;
          if (inpatientActor && !courtyardDoorRouteWindow) continue;
          const centre = courtyardDoorCentres[index],
            courtyardDistance = Math.min(
              actorHorizontalDistance(current, centre),
              actorHorizontalDistance(proposed, centre),
              companionCurrent
                ? actorHorizontalDistance(companionCurrent, centre)
                : Infinity,
              companionProposed
                ? actorHorizontalDistance(companionProposed, centre)
                : Infinity,
            );
          if (
            !bypassThirdFloorQueue &&
            !reserveCourtyardDoorQueue(
              key,
              thirdFloorDoorTravelDirection(
                current,
                proposed,
                centre,
                courtyardDoorDirections[index],
              ),
              current,
              proposed,
              centre,
              courtyardDoorQueues[index],
              companionCurrent,
              companionProposed,
            )
          )
            return false;
          if (courtyardDistance < (patientDoorTransit ? 4.25 : 1.68)) {
            courtyardAutoDoors[index].openTarget = 1;
            courtyardAutoDoors[index].closeAt = performance.now() + 2300;
            if (
              !patientDoorTransit &&
              courtyardDistance < 0.98 &&
              courtyardAutoDoors[index].openAmount < 0.76
            )
              return false;
          }
        }
        return true;
      },
      turnWardWalkerToward = (
        walker: Walker,
        targetYaw: number,
        dt: number,
      ) => {
        const yawDiff = Math.atan2(
            Math.sin(targetYaw - walker.group.rotation.y),
            Math.cos(targetYaw - walker.group.rotation.y),
          ),
          maxTurn = dt * 7.4;
        walker.group.rotation.y += THREE.MathUtils.clamp(
          yawDiff,
          -maxTurn,
          maxTurn,
        );
        return Math.abs(yawDiff) < 0.14;
      };

    const actorHorizontalDistance = (
        a: THREE.Vector3,
        b: THREE.Vector3,
      ) => Math.hypot(a.x - b.x, a.z - b.z),
      // Once the robot has crossed a ward doorway into the bed-side aisle it
      // becomes non-blocking to patients. The medication reservation still
      // keeps its own patient in bed, while neighbouring patients may mount or
      // leave their beds without the two actors deadlocking one another.
      medicationRobotIsInBedsideAisle = () => {
        if (medicationRobot.mode === "home") return false;
        const room = medicationRobotTargetRoom(),
          slot = wardBedSlots.find((candidate) => candidate.room === room);
        if (!slot) return false;
        const relative = medicationRobot.group.position
            .clone()
            .sub(slot.doorCentre)
            .setY(0),
          depth = relative.dot(slot.out),
          lateral = Math.abs(relative.dot(slot.tan)),
          halfWidth = room === 3 ? 3.18 : 5.82;
        return depth > 0.62 && depth < 7.75 && lateral < halfWidth;
      },
      // Patients never become hard obstacles to one another. Right-hand lanes
      // and soft following provide visual spacing without deadlocking trips.
      patientNurseConflictAt = (
        point: THREE.Vector3,
        ivPoint: THREE.Vector3,
      ) =>
        wardNurses.find(
          (nurse) =>
            (nurse.mode === "outbound" || nurse.mode === "returning") &&
            (actorHorizontalDistance(point, nurse.walker.group.position) <
              1.72 ||
              actorHorizontalDistance(ivPoint, nurse.walker.group.position) <
                1.72 ||
              (nurse.cartAttached &&
                (actorHorizontalDistance(point, nurse.cart.position) < 1.82 ||
                  actorHorizontalDistance(ivPoint, nurse.cart.position) <
                    1.82))),
        ) ||
        (medicationRobot.mode !== "home" &&
          !medicationRobotIsInBedsideAisle() &&
          !medicationRobotHandoffCollisionDisabled() &&
          (actorHorizontalDistance(point, medicationRobot.group.position) <
            1.58 ||
            actorHorizontalDistance(ivPoint, medicationRobot.group.position) <
              1.58)),
      inmateBlockingPoint = (
        self: InpatientActor,
        point: THREE.Vector3,
        ivPoint: THREE.Vector3,
      ) =>
        thirdFloorMedicalCarts.some((cart) => {
          const attached = wardNurses.some(
            (nurse) => nurse.cart === cart && nurse.cartAttached,
          ),
            currentGap = Math.min(
              actorHorizontalDistance(self.walker.group.position, cart.position),
              actorHorizontalDistance(self.slot.ivStand.position, cart.position),
            ),
            nextGap = Math.min(
              actorHorizontalDistance(point, cart.position),
              actorHorizontalDistance(ivPoint, cart.position),
            ),
            clearance = 0.94;
          if (attached) return false;
          // A patient already inside a parked cart's safety envelope must be
          // able to walk out. Blocking every candidate inside the radius used
          // to seal the patient in place; only inward/lateral steps are now
          // rejected until the full body and IV stand have cleared it.
          if (currentGap < clearance)
            return nextGap <= currentGap + 0.003;
          return nextGap < clearance;
        }) ||
        (medicationRobot.mode !== "home" &&
          !medicationRobotIsInBedsideAisle() &&
          !medicationRobotHandoffCollisionDisabled() &&
          (actorHorizontalDistance(point, medicationRobot.group.position) <
            0.82 ||
            actorHorizontalDistance(ivPoint, medicationRobot.group.position) <
              0.82)),
      startPatientRise = (
        actor: InpatientActor,
        route: THREE.Vector3[],
        arrival: InpatientArrival,
      ) => {
        actor.tray.visible = false;
        resetInpatientGown(actor.gown);
        actor.state = "rising";
        actor.timer = 0;
        actor.route = route.map((point) => point.clone());
        actor.waypoint = 1;
        actor.arrival = arrival;
        actor.transitionFromPosition.copy(actor.walker.group.position);
        actor.transitionFromQuaternion.copy(actor.walker.group.quaternion);
        actor.transitionFromScale.copy(actor.walker.group.scale);
        actor.transitionToPosition.copy(route[0]);
        actor.transitionToQuaternion.setFromEuler(
          new THREE.Euler(
            0,
            thirdFloorPatientYaw(
              route[0],
              route[Math.min(1, route.length - 1)],
            ),
            0,
          ),
        );
        actor.transitionToScale.setScalar(thirdFloorContentScale);
        actor.transitionStartsSeated = false;
        actor.ivParkPosition.copy(actor.slot.ivStand.position);
        actor.ivTransitionFromPosition.copy(actor.slot.ivStand.position);
        actor.avoidanceDetourActive = false;
        actor.avoidanceAttempt = 0;
        actor.courtyardTrafficWait = 0;
        actor.walker.group.userData.leavingCourtyardSeat = false;
      },
      startPatientSettling = (
        actor: InpatientActor,
        arrival: "bedRest" | "waitingCheck",
      ) => {
        const startsSeated = actor.state === "bedEat";
        const lie = lyingPose(actor.slot);
        resetInpatientGown(actor.gown);
        actor.state = "settling";
        actor.timer = 0;
        actor.arrival = arrival;
        actor.transitionFromPosition.copy(actor.walker.group.position);
        actor.transitionFromQuaternion.copy(actor.walker.group.quaternion);
        actor.transitionFromScale.copy(actor.walker.group.scale);
        actor.transitionToPosition.copy(lie.position);
        actor.transitionToQuaternion.copy(lie.quaternion);
        actor.transitionToScale.copy(lie.scale);
        actor.transitionStartsSeated = startsSeated;
        actor.ivTransitionFromPosition.copy(actor.slot.ivStand.position);
        actor.ivParkPosition.copy(inpatientBedIvParkPoint(actor.slot));
        actor.assignedCourtyardDoor = undefined;
      },
      startPatientWalk = (
        actor: InpatientActor,
        route: THREE.Vector3[],
        arrival: InpatientArrival,
      ) => {
        const fixedSeatExit = actor.walker.group.userData
          .courtyardSeatExitPoint as THREE.Vector3 | undefined;
        setWardWalkerStanding(
          actor.walker,
          thirdFloorPatientYaw(
            actor.walker.group.position,
            fixedSeatExit ??
              firstDistinctRouteTarget(actor.walker.group.position, route),
          ),
        );
        actor.walker.group.position.y = courtyardPatientGroundYAt(
          actor.walker.group.position,
        );
        actor.state = "walking";
        actor.timer = 0;
        actor.route = route.map((point) => point.clone());
        actor.waypoint = 0;
        actor.arrival = arrival;
        actor.blockedTime = 0;
        actor.avoidanceDetourActive = false;
        actor.avoidanceAttempt = 0;
        actor.courtyardTrafficWait = 0;
      },
      startPatientIvParking = (actor: InpatientActor) => {
        const current = actor.walker.group.position.clone(),
          currentQuaternion = actor.walker.group.quaternion.clone(),
          ivPark = inpatientBedIvParkPoint(actor.slot),
          parkingYaw = thirdFloorPatientYaw(current, ivPark);
        // Measure the live left-palm offset in the final pushing direction so
        // the patient, hand and stand arrive together without a last-frame
        // equipment snap at the north-wall parking point.
        actor.walker.group.rotation.set(0, parkingYaw, 0);
        actor.walker.arms[0].rotation.set(0.78, 0, 0.3);
        actor.walker.group.updateWorldMatrix(true, true);
        const palmOffset = inpatientIvPalmFloorPoint(actor)
          .sub(actor.walker.group.position)
          .setY(0);
        actor.walker.group.quaternion.copy(currentQuaternion);
        actor.state = "parkingIv";
        actor.timer = 0;
        actor.transitionFromPosition.copy(current);
        actor.transitionFromQuaternion.copy(currentQuaternion);
        actor.transitionToPosition.copy(ivPark).sub(palmOffset).setY(0);
        actor.transitionToQuaternion.setFromEuler(
          new THREE.Euler(0, parkingYaw, 0),
        );
        actor.ivParkPosition.copy(ivPark);
        actor.ivTransitionFromPosition.copy(actor.slot.ivStand.position);
      },
      courtyardSeatIsOccupied = (
        seatIndex: number,
        self?: InpatientActor,
      ) => {
        const seat = courtyardStoneSeats[seatIndex];
        return inpatientPatients.some(
          (patient) =>
            patient !== self &&
            ((patient.assignedCourtyardSeat === seatIndex &&
              (patient.state === "courtyardSit" ||
                patient.state === "socialTalk" ||
                (["rising", "walking"].includes(patient.state) &&
                  patient.arrival === "courtyardSit"))) ||
              ((patient.state === "courtyardSit" ||
                patient.state === "socialTalk") &&
                actorHorizontalDistance(
                  patient.walker.group.position,
                  seat,
                ) < 0.86)),
        );
      },
      courtyardSeatTaskIsValid = (actor: InpatientActor) => {
        if (actor.arrival !== "courtyardSit") return true;
        const seatIndex = actor.assignedCourtyardSeat;
        if (
          seatIndex === undefined ||
          courtyardSeatIsOccupied(seatIndex, actor)
        )
          return false;
        const invitedBy = actor.walker.group.userData.conversationInvitedBy;
        if (invitedBy === undefined) return true;
        const host = inpatientPatients[invitedBy],
          expectedSeat =
            host?.assignedCourtyardSeat !== undefined
              ? host.assignedCourtyardSeat % 2 === 0
                ? host.assignedCourtyardSeat + 1
                : host.assignedCourtyardSeat - 1
              : undefined;
        return (
          !!host &&
          host.state === "courtyardSit" &&
          !host.inspectionReserved &&
          expectedSeat === seatIndex
        );
      },
      startSeatedConversation = (
        actor: InpatientActor,
        partner: InpatientActor,
      ) => {
        const actorIndex = actor.walker.group.userData.inpatientIndex,
          partnerIndex = partner.walker.group.userData.inpatientIndex,
          duration = 6 + ((actorIndex + partnerIndex) % 5),
          actorSeatedAt =
            actor.walker.group.userData.courtyardSeatedAt ?? 0,
          partnerSeatedAt =
            partner.walker.group.userData.courtyardSeatedAt ?? 0,
          actorIsVisitor =
            actorSeatedAt === partnerSeatedAt
              ? actorIndex > partnerIndex
              : actorSeatedAt > partnerSeatedAt;
        // Conversation pauses (rather than replaces) the original host's
        // stone-seat countdown. The later arrival is the visitor and leaves
        // first; the earlier patient resumes the exact remaining rest plus
        // three seconds after the conversation.
        actor.pausedCourtyardRest = Math.max(0, actor.timer);
        partner.pausedCourtyardRest = Math.max(0, partner.timer);
        actor.conversationVisitor = actorIsVisitor;
        partner.conversationVisitor = !actorIsVisitor;
        actor.state = "socialTalk";
        partner.state = "socialTalk";
        actor.partner = partnerIndex;
        partner.partner = actorIndex;
        // Remember this pair until each patient returns to a bed. A patient
        // may keep walking or talk to somebody else after leaving, but cannot
        // immediately restart a conversation with the same person.
        actor.walker.group.userData.lastCourtyardConversationPartner =
          partnerIndex;
        partner.walker.group.userData.lastCourtyardConversationPartner =
          actorIndex;
        actor.timer = duration;
        partner.timer = duration;
      },
      continueAfterCancelledConversation = (actor: InpatientActor) => {
        actor.walker.group.userData.conversationInvitedBy = undefined;
        // The home-route builder handles cancellation from the room, corridor,
        // promenade or reserved cap and preserves the fixed one-way seat exit
        // whenever the patient has already reached it.
        beginPatientHomeRoute(actor, "bedRest");
      },
      seatPatientInCourtyard = (actor: InpatientActor) => {
        const invitedBy = actor.walker.group.userData.conversationInvitedBy,
          invitedHost =
            invitedBy !== undefined ? inpatientPatients[invitedBy] : undefined,
          preferredSeat =
            actor.assignedCourtyardSeat ??
            (actor.walker.group.userData.inpatientIndex %
              courtyardStoneSeats.length),
          expectedNeighbourSeat =
            invitedHost?.assignedCourtyardSeat !== undefined
              ? invitedHost.assignedCourtyardSeat % 2 === 0
                ? invitedHost.assignedCourtyardSeat + 1
                : invitedHost.assignedCourtyardSeat - 1
              : undefined;
        if (
          invitedBy !== undefined &&
          (!invitedHost ||
            invitedHost.state !== "courtyardSit" ||
            invitedHost.inspectionReserved ||
            expectedNeighbourSeat !== preferredSeat ||
            courtyardSeatIsOccupied(preferredSeat, actor))
        ) {
          // Conversation invitations are validated only on arrival. If the
          // host or adjacent seat is no longer available, immediately resume
          // a valid outing/return route rather than waiting on the promenade.
          continueAfterCancelledConversation(actor);
          return;
        }
        const seatIndex = Array.from(
            { length: courtyardStoneSeats.length },
            (_, offset) =>
              (preferredSeat + offset) % courtyardStoneSeats.length,
          )
            .find((index) => !courtyardSeatIsOccupied(index, actor));
        if (seatIndex === undefined) {
          // A seat can remain reserved while its owner is still approaching.
          // Keep this patient moving instead of stacking them on an occupied
          // stone seat; the normal activity scheduler will assign a later
          // opportunity after the patient returns.
          actor.assignedCourtyardSeat = undefined;
          beginPatientHomeRoute(actor, "bedRest");
          return;
        }
        const seat = courtyardStoneSeats[seatIndex],
          outward = courtyardStoneSeatOutwardDirections[seatIndex],
          yaw = thirdFloorYaw(seat, seat.clone().add(outward));
        actor.assignedCourtyardSeat = seatIndex;
        actor.walker.group.position.copy(seat);
        setWardWalkerSeated(actor.walker, yaw, seat.y);
        actor.slot.ivStand.position.copy(
          courtyardStoneSeatIvParkPoint(seatIndex),
        );
        actor.state = "courtyardSit";
        actor.timer =
          10 + (actor.walker.group.userData.inpatientIndex % 6);
        actor.pausedCourtyardRest = 0;
        actor.conversationVisitor = false;
        actor.walker.group.userData.courtyardSeatedAt = performance.now();
        actor.walker.group.userData.leavingCourtyardSeat = false;
        actor.walker.group.userData.courtyardSeatExitIndex = undefined;
        actor.walker.group.userData.courtyardSeatExitPoint = undefined;
        actor.walker.group.userData.conversationInvitedBy = undefined;
        if (invitedHost) startSeatedConversation(actor, invitedHost);
      },
      finishPatientRoute = (actor: InpatientActor) => {
        if (actor.arrival === "courtyardSit") {
          seatPatientInCourtyard(actor);
          return;
        }
        startPatientIvParking(actor);
      },
      patientCurrentStatus = (actor: InpatientActor) => {
        if (actor.state === "bedEat") return "正在病床上用餐";
        if (actor.state === "waitingMedication")
          return "剛完成檢查，正在病床上等待給藥";
        if (
          actor.state === "medicationSittingUp" ||
          actor.state === "takingMedication" ||
          actor.state === "medicationSettling"
        )
          return "正在給藥機器人協助下服藥";
        if (actor.state === "courtyardSit") return "正在中庭石椅休息";
        if (actor.state === "socialTalk")
          return "正在與病友交談";
        if (actor.state === "beingChecked") return "正在接受護理師檢查";
        if (
          actor.state === "walking" ||
          actor.state === "rising" ||
          actor.state === "parkingIv"
        )
          return actor.arrival === "waitingCheck"
            ? "正在返回病床等待護理檢查"
            : "正扶著點滴架散步";
        if (actor.state === "waitingCheck" || actor.inspectionReserved)
          return "正在病床上等待護理檢查";
        return "正在病床上休息";
      },
      applySupinePatientPose = (
        actor: InpatientActor,
        t: number,
        allowRestTurn: boolean,
      ) => {
        const lie = lyingPose(actor.slot),
          actorIndex = actor.walker.group.userData.inpatientIndex,
          breathing = Math.sin(t * 1.18 + actorIndex * 0.73),
          inhale = (breathing + 1) * 0.5,
          turnCycle = (t + actorIndex * 4.1) % 30,
          turnProgress = THREE.MathUtils.clamp(
            (turnCycle - 12) / 6.2,
            0,
            1,
          ),
          restTurn =
            allowRestTurn && turnCycle >= 12 && turnCycle <= 18.2
              ? Math.sin(turnProgress * Math.PI) *
                (actorIndex % 2 ? 0.32 : -0.32)
              : 0,
          roll = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            restTurn,
          );
        actor.walker.group.position.copy(lie.position);
        actor.walker.group.position.y +=
          inhale * 0.008 + Math.abs(restTurn) * 0.065;
        actor.walker.group.quaternion.copy(lie.quaternion).multiply(roll);
        actor.walker.group.scale.copy(lie.scale);
        setWardWalkerLyingLimbs(actor.walker);
        // The visible gown covers the generic torso mesh, so drive its surface
        // directly. This makes the gentle breathing readable without turning
        // it into a large whole-body bob.
        actor.gown.position.set(0, 0.84, -0.015 - inhale * 0.012);
        actor.gown.scale.set(
          1 + breathing * 0.006,
          1 + breathing * 0.008,
          1 + breathing * 0.026,
        );
        actor.walker.headRig.rotation.z = restTurn * 0.16;
        actor.walker.arms[0].rotation.z = restTurn * 0.18;
        actor.walker.arms[1].rotation.z = restTurn * 0.12;
        actor.walker.group.children.forEach((part) => {
          if (part.userData.uniformPart && Math.abs(part.position.x) < 0.05)
            part.scale.set(
              1 + breathing * 0.006,
              1 + breathing * 0.014,
              1 + breathing * 0.01,
            );
        });
      };

    let inpatientTaskSequence = 0;
      const beginPatientHomeRoute = (
        actor: InpatientActor,
        arrival: "bedRest" | "waitingCheck",
        continueCourtyardWalk = false,
      ) => {
        const route = patientHomeTail(
          actor.slot,
          actor.assignedCourtyardDoor ?? 0,
        ),
          assignedDepartureSeat = actor.assignedCourtyardSeat,
          nearestStoneSeatIndex = courtyardStoneSeats.reduce(
            (nearest, seat, index) =>
              actorHorizontalDistance(actor.walker.group.position, seat) <
              actorHorizontalDistance(
                actor.walker.group.position,
                courtyardStoneSeats[nearest],
              )
                ? index
                : nearest,
            0,
          ),
          // Adjacent places on the same bench are 0.92 m apart. A first-match
          // proximity lookup can therefore mistake an odd-numbered place for
          // its earlier neighbour and build the wrong narrow exit channel.
          // The actor's reserved seat is authoritative while it remains close;
          // nearest-seat lookup is only a fallback for defensive recovery.
          leavingStoneSeatIndex =
            assignedDepartureSeat !== undefined &&
            actorHorizontalDistance(
              actor.walker.group.position,
              courtyardStoneSeats[assignedDepartureSeat],
            ) < 0.52
              ? assignedDepartureSeat
              : actorHorizontalDistance(
                    actor.walker.group.position,
                    courtyardStoneSeats[nearestStoneSeatIndex],
                  ) < 0.92
                ? nearestStoneSeatIndex
                : -1,
          leavingStoneSeat = leavingStoneSeatIndex >= 0;
        actor.assignedCourtyardSeat = undefined;
        if (isInsideCourtyardFootprint(actor.walker.group.position)) {
          actor.walker.group.userData.leavingCourtyardSeat = leavingStoneSeat;
          actor.walker.group.userData.courtyardSeatExitIndex =
            leavingStoneSeat ? leavingStoneSeatIndex : undefined;
          actor.walker.group.userData.courtyardSeatExitPoint =
            leavingStoneSeat
              ? courtyardStoneSeatExitPoint(leavingStoneSeatIndex)
              : undefined;
          // Return routes continue clockwise around the circle and use the
          // opposite right-hand lane instead of reversing the inbound line.
          const current = actor.walker.group.position,
            seatExit = leavingStoneSeat
              ? courtyardStoneSeatExitPoint(leavingStoneSeatIndex)
              : undefined,
            returnOrigin = seatExit ?? current,
            baseCourtyardReturn =
              Math.abs(returnOrigin.x) <= 1.2 && returnOrigin.z <= 2.2
                ? courtyardRightLaneRoute([
                    returnOrigin.clone().setY(0),
                    new THREE.Vector3(0, 0, 1.72),
                    courtyardNorthExitRelease.clone(),
                  ])
                : courtyardSafeReturnRouteFrom(returnOrigin),
            courtyardReturn = seatExit
              ? [current.clone().setY(0), seatExit].concat(
                  baseCourtyardReturn.slice(1),
                )
              : baseCourtyardReturn;
          const extendedCourtyardRoute = continueCourtyardWalk
            ? courtyardReturn
                .concat(courtyardNorthEntryRelease.clone())
                .concat(courtyardSafeWalkLoop().slice(1))
            : courtyardReturn;
          startPatientWalk(
            actor,
            extendedCourtyardRoute.concat(route.slice(1)),
            arrival,
          );
          return;
        }
        if (!isInsideCourtyardFootprint(actor.walker.group.position)) {
          const roomDepth = actor.walker.group.position
            .clone()
            .sub(actor.slot.doorCentre)
            .dot(actor.slot.out);
          if (roomDepth > 0.12) {
            const outboundRoomPath = [
                bedExitPoint(actor.slot),
                bedAislePoint(actor.slot),
                roomInsidePoint(actor.slot),
              ],
              closestRoomIndex = outboundRoomPath.reduce(
                (bestIndex, point, index) =>
                  actorHorizontalDistance(actor.walker.group.position, point) <
                  actorHorizontalDistance(
                    actor.walker.group.position,
                    outboundRoomPath[bestIndex],
                  )
                    ? index
                    : bestIndex,
                0,
              );
            startPatientWalk(
              actor,
              outboundRoomPath.slice(0, closestRoomIndex + 1).reverse(),
              arrival,
            );
            return;
          }
          const lastPublicIndex = Math.max(
              2,
              route.findIndex(
                (point) =>
                  actorHorizontalDistance(point, roomOutsidePoint(actor.slot)) <
                  0.05,
              ),
            );
          let closestIndex = 2,
            closestDistance = Infinity;
          route.forEach((point, index) => {
            if (index < 2 || index > lastPublicIndex) return;
            const distance = actorHorizontalDistance(
              actor.walker.group.position,
              point,
            );
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = index;
            }
          });
          route.splice(0, closestIndex);
        }
        startPatientWalk(actor, route, arrival);
      },
      minimumInBedPatients = 4,
      minimumOutOfBedPatients = 1,
      maximumOutOfBedPatients = 4,
      patientActivityCounts = () => {
        let walk = 0,
          sit = 0,
          eat = 0;
        inpatientPatients.forEach((patient) => {
          if (patient.state === "bedEat") {
            eat++;
            return;
          }
          if (
            patient.state === "courtyardSit" ||
            patient.state === "socialTalk" ||
            (["rising", "walking"].includes(patient.state) &&
              patient.arrival === "courtyardSit")
          ) {
            sit++;
            return;
          }
          if (["rising", "walking", "parkingIv"].includes(patient.state))
            walk++;
        });
        return {
          walk,
          sit,
          eat,
          activity: walk + sit,
          // Dining belongs to the in-bed population. With eight patients and
          // one to four patients physically out of bed, this stays within
          // four to seven; diners are included rather than counted on top.
          inBed: inpatientPatients.length - walk - sit,
          rest: inpatientPatients.length - walk - sit - eat,
        };
      },
      comparePatientActivityPriority = (
        a: InpatientActor,
        b: InpatientActor,
      ) =>
        a.lastActivitySequence - b.lastActivitySequence ||
        a.timer - b.timer ||
        a.activityPriority - b.activityPriority,
      markPatientTaskStarted = (
        actor: InpatientActor,
        task: InpatientTask,
      ) => {
        actor.lastTask = task;
        actor.lastActivitySequence = ++inpatientActivitySequence;
      },
      selectPatientCourtyardDoor = (actor: InpatientActor): 0 | 1 | 2 => {
        const sideDoor: 1 | 2 = actor.slot.room === 1 ? 1 : 2,
          actorIndex = actor.walker.group.userData.inpatientIndex,
          preferred: 0 | 1 | 2 =
            (actorIndex + inpatientTaskSequence) % 2 === 0 ? sideDoor : 0,
          options: Array<0 | 1 | 2> = [preferred, preferred === 0 ? sideDoor : 0];
        return options.sort((a, b) => {
          const score = (doorIndex: 0 | 1 | 2) =>
            courtyardDoorQueues[doorIndex].queue.length * 2 +
            inpatientPatients.filter(
              (patient) =>
                ["rising", "walking"].includes(patient.state) &&
                actorHorizontalDistance(
                  patient.walker.group.position,
                  courtyardDoorCentres[doorIndex],
                ) < 2.6,
            ).length *
              2 +
            (doorIndex === preferred ? 0 : 0.4);
          return score(a) - score(b);
        })[0];
      },
      schedulePatientTask = (
        actor: InpatientActor,
        preferredTask?: InpatientTask,
      ) => {
        if (
          actor.inspectionReserved ||
          actor.medicationReserved ||
          actor.postInspectionCooldown > 0 ||
          actor.state !== "bedRest"
        )
          return false;
        const counts = patientActivityCounts();
        const ordered: InpatientTask[] = [
            "courtyardSit",
            "courtyardSit",
            "walk",
            "eat",
          ],
          offset =
            (actor.walker.group.userData.inpatientIndex +
              inpatientTaskSequence++) %
            ordered.length,
          rotated = ordered.slice(offset).concat(ordered.slice(0, offset)),
          minimumPriority: InpatientTask[] = [
            ...(counts.activity < minimumOutOfBedPatients
              ? ([counts.sit <= counts.walk ? "courtyardSit" : "walk"] as InpatientTask[])
              : []),
            ...(counts.eat < 1 ? (["eat"] as InpatientTask[]) : []),
          ],
          choices = preferredTask
            ? ([preferredTask] as InpatientTask[])
            : [...new Set(minimumPriority.concat(rotated))].filter(
                (task) => task !== actor.lastTask,
              );
        for (const task of choices) {
          const latestCounts = patientActivityCounts();
          if (
            (task !== "eat" &&
              latestCounts.inBed <= minimumInBedPatients) ||
            (task !== "eat" && patientDepartureCooldown > 0) ||
            task === actor.lastTask
          )
            continue;
          if (task === "eat" && latestCounts.eat < 2) {
            markPatientTaskStarted(actor, task);
            actor.assignedCourtyardDoor = undefined;
            actor.state = "bedEat";
            actor.timer = 10 + (inpatientTaskSequence % 5);
            actor.tray.visible = true;
            resetInpatientGown(actor.gown);
            const seatPose = wardBedSeatPose(actor.slot);
            resetWardWalkerPose(actor.walker);
            actor.walker.group.position.copy(seatPose.position);
            actor.walker.group.quaternion.copy(seatPose.quaternion);
            actor.walker.group.scale.copy(seatPose.scale);
            setWardWalkerSeatedLegs(actor.walker);
            return true;
          }
          if (
            task === "walk" &&
            latestCounts.walk < 1 &&
            latestCounts.activity < maximumOutOfBedPatients
          ) {
            const doorIndex = selectPatientCourtyardDoor(actor),
              entryRoute = patientOutboundRoute(
                actor.slot,
                courtyardNorthEntryRelease,
                doorIndex,
              ).slice(0, -1),
              safeLoop = courtyardSafeWalkLoop(),
              homeTail = patientHomeTail(actor.slot, doorIndex),
              route = entryRoute
                .concat(safeLoop.slice(1))
                .concat(homeTail.slice(1));
            markPatientTaskStarted(actor, task);
            actor.assignedCourtyardDoor = doorIndex;
            patientDepartureCooldown = 3;
            startPatientRise(actor, route, "bedRest");
            return true;
          }
          if (
            task === "courtyardSit" &&
            latestCounts.sit < 3 &&
            latestCounts.activity < maximumOutOfBedPatients
          ) {
            const neighbourSeat = inpatientPatients
                .filter(
                  (patient) =>
                    patient !== actor &&
                    (patient.state === "courtyardSit" ||
                      patient.state === "socialTalk") &&
                    patient.assignedCourtyardSeat !== undefined,
                )
                .map((patient) =>
                  patient.assignedCourtyardSeat! % 2 === 0
                    ? patient.assignedCourtyardSeat! + 1
                    : patient.assignedCourtyardSeat! - 1,
                )
                .find((index) => !courtyardSeatIsOccupied(index, actor)),
              preferredSeat =
                neighbourSeat ??
                actor.walker.group.userData.inpatientIndex %
                courtyardStoneSeats.length,
              seatIndex = Array.from(
                { length: courtyardStoneSeats.length },
                (_, offset) =>
                  (preferredSeat + offset) % courtyardStoneSeats.length,
              )
                .find((index) => !courtyardSeatIsOccupied(index, actor));
            if (seatIndex === undefined) continue;
            const seat = courtyardStoneSeats[seatIndex],
              doorIndex = selectPatientCourtyardDoor(actor),
              entryRoute = patientOutboundRoute(
                actor.slot,
                courtyardNorthEntryRelease,
                doorIndex,
              ).slice(0, -1),
              courtyardRoute = courtyardSafeRouteTo(seat);
            markPatientTaskStarted(actor, task);
            actor.assignedCourtyardSeat = seatIndex;
            actor.assignedCourtyardDoor = doorIndex;
            patientDepartureCooldown = 3;
            startPatientRise(
              actor,
              entryRoute.concat(courtyardRoute.slice(1)),
              "courtyardSit",
            );
            return true;
          }
        }
        actor.timer = 4 + (inpatientTaskSequence % 3);
        return false;
      },
      initializeOpeningCourtyardPatient = () => {
        // Defer the opening placement until every seat, route and task helper
        // has been initialized. Reuse the normal seating function so the
        // opening patient receives exactly the same complete state as a
        // patient who walked to the bench during the simulation.
        const actor = inpatientPatients[initialSeatedPatientIndex];
        if (!actor || courtyardStoneSeats.length === 0) return;
        const seatIndex =
          initialSeatedPatientIndex % courtyardStoneSeats.length;
        actor.arrival = "courtyardSit";
        actor.lastTask = "courtyardSit";
        actor.lastActivitySequence = ++inpatientActivitySequence;
        actor.assignedCourtyardSeat = seatIndex;
        actor.assignedCourtyardDoor = 0;
        actor.walker.group.position.copy(courtyardStoneSeats[seatIndex]);
        seatPatientInCourtyard(actor);
        actor.motionWatchPosition.copy(actor.walker.group.position);
      };

    let patientActivityDispatchTimer = 0,
      thirdFloorCareActivated = false;
    const maintainPatientActivityMix = (dt: number, t: number) => {
      patientActivityDispatchTimer -= dt;
      if (patientActivityDispatchTimer > 0) return;
      patientActivityDispatchTimer = 0.65;
      const waves = [
          { activity: 1, sit: 1, walk: 0, eat: 1 },
          { activity: 2, sit: 1, walk: 1, eat: 1 },
          { activity: 3, sit: 2, walk: 1, eat: 2 },
          { activity: 4, sit: 3, walk: 1, eat: 1 },
        ],
        target =
          waves[
            (Math.floor(t / 18) + initialActivityWaveOffset) % waves.length
          ],
        fill = (
          task: "walk" | "courtyardSit" | "eat",
          targetCount: number,
        ) => {
          const countForTask = () => {
            const counts = patientActivityCounts();
            return task === "walk"
              ? counts.walk
              : task === "courtyardSit"
                ? counts.sit
                : counts.eat;
          };
          while (countForTask() < targetCount) {
            const counts = patientActivityCounts();
            if (
              task !== "eat" &&
              counts.inBed <= minimumInBedPatients
            )
              break;
            const candidates = inpatientPatients
              .filter(
                (patient) =>
                  patient.state === "bedRest" &&
                  !patient.inspectionReserved &&
                  !patient.medicationReserved &&
                  patient.postInspectionCooldown <= 0 &&
                  patient.lastTask !== task,
              )
              .sort(comparePatientActivityPriority);
            const candidate = candidates[0];
            if (!candidate) break;
            candidate.timer = 0;
            if (!schedulePatientTask(candidate, task)) break;
          }
        };
      // Dining is a sub-state of the 4–7 patients who remain at their beds; it
      // never adds another patient beyond that total. Corridor walking,
      // courtyard walking, stone-seat rest and social activity share one
      // combined 1–4-person allowance.
      fill("eat", target.eat);
      // Prefer short, purposeful stone-seat rests over continuous promenade
      // loops. Conversation never creates a waiting actor on the walkway; it
      // only pairs neighbours after both have independently reached a bench.
      fill("courtyardSit", target.sit);
      fill("walk", target.walk);
      while (patientActivityCounts().activity < target.activity) {
        const counts = patientActivityCounts();
        if (
          counts.inBed <= minimumInBedPatients ||
          counts.activity >= maximumOutOfBedPatients
        )
          break;
        const preferred: "walk" | "courtyardSit" =
            counts.sit < target.sit ? "courtyardSit" : "walk",
          alternatives: Array<"walk" | "courtyardSit"> = [
            preferred,
            preferred === "walk" ? "courtyardSit" : "walk",
          ];
        let scheduled = false;
        for (const task of alternatives) {
          const candidate = inpatientPatients
            .filter(
              (patient) =>
                patient.state === "bedRest" &&
                !patient.inspectionReserved &&
                !patient.medicationReserved &&
                patient.postInspectionCooldown <= 0 &&
                patient.lastTask !== task,
            )
            .sort(comparePatientActivityPriority)[0];
          if (candidate && schedulePatientTask(candidate, task)) {
            scheduled = true;
            break;
          }
        }
        if (!scheduled) break;
      }
    };

    let seatedConversationCheckTimer = 0;
    const startOpportunisticSeatedConversation = (
      dt: number,
      t: number,
    ) => {
      seatedConversationCheckTimer -= dt;
      if (seatedConversationCheckTimer > 0) return;
      seatedConversationCheckTimer = 1;
      const seated = inpatientPatients.filter(
        (patient) =>
          patient.state === "courtyardSit" &&
          !patient.inspectionReserved &&
          patient.partner === undefined &&
          patient.assignedCourtyardSeat !== undefined &&
          // Let both patients settle briefly. A conversation is established
          // only after both are already seated, never as a waiting task.
          performance.now() -
            (patient.walker.group.userData.courtyardSeatedAt ?? 0) >=
            650,
      );
      for (const actor of seated) {
        const seatIndex = actor.assignedCourtyardSeat!,
          neighbourIndex = seatIndex % 2 === 0 ? seatIndex + 1 : seatIndex - 1,
          partner = seated.find(
            (candidate) =>
              candidate !== actor &&
              actor.walker.group.userData
                .lastCourtyardConversationPartner !==
                candidate.walker.group.userData.inpatientIndex &&
              candidate.walker.group.userData
                .lastCourtyardConversationPartner !==
                actor.walker.group.userData.inpatientIndex &&
              candidate.assignedCourtyardSeat === neighbourIndex,
          );
        if (!partner) continue;
        const actorIndex = actor.walker.group.userData.inpatientIndex,
          partnerIndex = partner.walker.group.userData.inpatientIndex;
        // A deterministic low-frequency gate keeps conversations occasional
        // without pre-booking either participant or introducing idle waits.
        if ((Math.floor(t) + Math.min(actorIndex, partnerIndex) * 3) % 5 !== 0)
          continue;
        startSeatedConversation(actor, partner);
        return;
      }
    };

    const invitePassingPatientToNeighbourSeat = (
      actor: InpatientActor,
      t: number,
    ) => {
      if (
        actor.state !== "walking" ||
        actor.arrival !== "bedRest" ||
        actor.assignedCourtyardSeat !== undefined ||
        !isInsideCourtyardFootprint(actor.walker.group.position) ||
        t < (actor.walker.group.userData.nextCourtyardConversationOffer ?? 0)
      )
        return false;
      const host = inpatientPatients
        .filter(
          (patient) =>
            patient !== actor &&
            actor.walker.group.userData.lastCourtyardConversationPartner !==
              patient.walker.group.userData.inpatientIndex &&
            patient.walker.group.userData.lastCourtyardConversationPartner !==
              actor.walker.group.userData.inpatientIndex &&
            patient.state === "courtyardSit" &&
            !patient.inspectionReserved &&
            patient.assignedCourtyardSeat !== undefined &&
            patient.timer > 3,
        )
        .sort(
          (a, b) =>
            actorHorizontalDistance(
              actor.walker.group.position,
              a.walker.group.position,
            ) -
            actorHorizontalDistance(
              actor.walker.group.position,
              b.walker.group.position,
            ),
        )[0];
      if (!host || host.assignedCourtyardSeat === undefined) return false;
      const hostDistance = actorHorizontalDistance(
        actor.walker.group.position,
        host.walker.group.position,
      );
      if (hostDistance > 2.25) return false;
      const neighbourIndex =
        host.assignedCourtyardSeat % 2 === 0
          ? host.assignedCourtyardSeat + 1
          : host.assignedCourtyardSeat - 1;
      actor.walker.group.userData.nextCourtyardConversationOffer = t + 7;
      if (
        courtyardSeatIsOccupied(neighbourIndex, actor) ||
        Math.random() >= 0.7
      )
        return false;
      const seat = courtyardStoneSeats[neighbourIndex],
        fullRoute = courtyardSafeRouteTo(seat),
        closestIndex = fullRoute.reduce(
          (best, point, index) =>
            actorHorizontalDistance(actor.walker.group.position, point) <
            actorHorizontalDistance(actor.walker.group.position, fullRoute[best])
              ? index
              : best,
          0,
        ),
        route = [
          actor.walker.group.position.clone().setY(0),
          // Never skip the final promenade-side approach point, even when a
          // passing patient is already closer to the stone cap than to the
          // preceding loop waypoint.
          ...fullRoute.slice(Math.min(closestIndex + 1, fullRoute.length - 2)),
        ];
      actor.lastTask = "courtyardSit";
      actor.assignedCourtyardSeat = neighbourIndex;
      actor.walker.group.userData.conversationInvitedBy =
        host.walker.group.userData.inpatientIndex;
      startPatientWalk(actor, route, "courtyardSit");
      return true;
    };

    const inpatientProjectedIvPoint = (
        point: THREE.Vector3,
        yaw: number,
      ) =>
        point
          .clone()
          .add(
            new THREE.Vector3(-0.36, 0, -0.34).applyAxisAngle(
              new THREE.Vector3(0, 1, 0),
              yaw,
            ),
          )
          .setY(0),
      courtyardSameDirectionSpeedFactor = (
        actor: InpatientActor,
        current: THREE.Vector3,
        direction: THREE.Vector3,
      ) => {
        const right = new THREE.Vector3(-direction.z, 0, direction.x);
        let factor = 1;
        inpatientPatients.forEach((other) => {
          if (other === actor || other.state !== "walking") return;
          const otherTarget = other.route[other.waypoint];
          if (!otherTarget) return;
          const otherDirection = otherTarget
            .clone()
            .sub(other.walker.group.position)
            .setY(0);
          if (otherDirection.lengthSq() < 0.001) return;
          otherDirection.normalize();
          // Opposing streams already occupy independent right-hand routes.
          // Only match speed behind a patient travelling in the same stream.
          if (direction.dot(otherDirection) < 0.72) return;
          const relative = other.walker.group.position
              .clone()
              .sub(current)
              .setY(0),
            longitudinal = relative.dot(direction),
            lateral = Math.abs(relative.dot(right));
          if (longitudinal <= 0.18 || longitudinal >= 1.65 || lateral >= 0.85)
            return;
          const localFactor = THREE.MathUtils.lerp(
            0.22,
            1,
            THREE.MathUtils.clamp((longitudinal - 0.18) / 1.47, 0, 1),
          );
          factor = Math.min(factor, localFactor);
        });
        // Never stop or reserve the lane. Followers begin matching speed
        // earlier and retain a small crawl speed, preventing both deadlock and
        // the normal visual overlap caused by catching a leader at a corner.
        return factor;
      },
      moveInpatient = (actor: InpatientActor, dt: number, t: number) => {
      const currentPosition = actor.walker.group.position,
        medicalCartRecovery = actor.walker.group.userData
          .medicalCartRecovery as THREE.Vector3 | undefined,
        trappedCart = medicalCartRecovery
          ? undefined
          : thirdFloorMedicalCarts.find((cart) => {
              const attached = wardNurses.some(
                  (nurse) => nurse.cart === cart && nurse.cartAttached,
                ),
                gap = Math.min(
                  actorHorizontalDistance(currentPosition, cart.position),
                  actorHorizontalDistance(actor.slot.ivStand.position, cart.position),
                );
              return !attached && gap < 0.94;
            });
      if (trappedCart) {
        // Leave the cart rack toward the station's open outer aisle first,
        // then rejoin the public corridor. This fixed two-leg release cannot
        // search into another parked cart or through the outer wall.
        const rackRelease = new THREE.Vector3(
            trappedCart.position.x - 1.42,
            0,
            currentPosition.z,
          ),
          corridorRelease = new THREE.Vector3(
            rackRelease.x,
            0,
            wardNurseCorridorZ,
          );
        actor.route.splice(actor.waypoint, 0, rackRelease, corridorRelease);
        actor.walker.group.userData.medicalCartRecovery = rackRelease.clone();
        actor.avoidanceDetourActive = true;
        actor.blockedTime = 0;
        actor.motionStallTime = 0;
        actor.motionWatchPosition.copy(currentPosition);
      }
      const target = actor.route[actor.waypoint];
      if (!target) {
        finishPatientRoute(actor);
        return;
      }
      const current = actor.walker.group.position,
        delta = target.clone().sub(current).setY(0),
        distance = delta.length(),
        assignedSeatIndex = actor.assignedCourtyardSeat ?? -1,
        assignedSeat = courtyardStoneSeats[assignedSeatIndex],
        assignedSeatApproach =
          assignedSeatIndex >= 0
            ? courtyardStoneSeatExitPoint(assignedSeatIndex)
            : undefined,
        assignedSeatIvPark =
          assignedSeatIndex >= 0
            ? courtyardStoneSeatIvParkPoint(assignedSeatIndex)
            : undefined,
        nearAssignedSeat =
          assignedSeat !== undefined &&
          actorHorizontalDistance(current, assignedSeat) < 1.48,
        seatExitPoint = actor.walker.group.userData
          .courtyardSeatExitPoint as THREE.Vector3 | undefined,
        leavingCourtyardSeat =
          actor.walker.group.userData.leavingCourtyardSeat === true,
        seatExitWaypoint =
          leavingCourtyardSeat &&
          seatExitPoint !== undefined &&
          actorHorizontalDistance(target, seatExitPoint) < 0.08,
        seatApproachWaypoint =
          actor.arrival === "courtyardSit" &&
          assignedSeatApproach !== undefined &&
          actorHorizontalDistance(target, assignedSeatApproach) < 0.08,
        seatLandingWaypoint =
          actor.arrival === "courtyardSit" &&
          assignedSeat !== undefined &&
          actorHorizontalDistance(target, assignedSeat) < 0.08,
        recoveryWaypoint = actor.avoidanceDetourActive,
        medicalCartRecoveryWaypoint =
          medicalCartRecovery !== undefined &&
          actorHorizontalDistance(target, medicalCartRecovery) < 0.08,
        exactCourtyardWaypoint =
          seatExitWaypoint ||
          seatApproachWaypoint ||
          seatLandingWaypoint ||
          recoveryWaypoint,
        doorWaypoint =
          wardDoorCentres.some(
            (centre) => actorHorizontalDistance(target, centre) < 0.14,
          ) ||
          courtyardDoorCentres.some(
            (centre) => actorHorizontalDistance(target, centre) < 0.14,
          ) ||
          courtyardDoorLaneThresholds.some(
            (point) => actorHorizontalDistance(target, point) < 0.14,
          ),
        assignedDoorIndex = actor.assignedCourtyardDoor ?? 0,
        assignedDoorCentre = courtyardDoorCentres[assignedDoorIndex],
        assignedDoorDirection = courtyardDoorDirections[assignedDoorIndex],
        doorSegmentDirection = delta.clone().normalize(),
        publicWardDepth = current
          .clone()
          .sub(actor.slot.doorCentre)
          .dot(actor.slot.out),
        // Door-exact movement applies only to the straight segment through
        // this patient's assigned doorway. Merely walking near an east or
        // west exit must never activate a hidden stop/turn zone.
        straightCourtyardDoorTransit =
          (actorHorizontalDistance(current, assignedDoorCentre) < 2.45 ||
            actorHorizontalDistance(target, assignedDoorCentre) < 2.45) &&
          Math.abs(doorSegmentDirection.dot(assignedDoorDirection)) > 0.9,
        // The east-west promenade is a surveyed straight corridor between
        // the upper and lower planting/bench rows. Follow its segment exactly
        // rather than applying curved look-ahead, which can bow the patient or
        // IV stand into the exclusion boundary and create a permanent stall.
        eastWestCourtyardTransit =
          isInsideCourtyardFootprint(current) &&
          isInsideCourtyardFootprint(target) &&
          Math.abs(current.z - 3.48) <= 1.06 &&
          Math.abs(target.z - 3.48) <= 1.06 &&
          Math.abs(delta.x) > 0.12 &&
          Math.abs(delta.x) > Math.abs(delta.z) * 1.3,
        exactMovementWaypoint =
          exactCourtyardWaypoint ||
          straightCourtyardDoorTransit ||
          eastWestCourtyardTransit ||
          // Outside the assigned room, patients follow the surveyed ward
          // polyline exactly. Curved person-avoidance previously bowed a
          // westbound patient south into the nursing counter and cart rack.
          // Characters do not collide here, so no lateral search is needed.
          (!isInsideCourtyardFootprint(current) && publicWardDepth < -0.52),
        waypointThreshold = exactMovementWaypoint
          ? 0.08
          : doorWaypoint
            ? 0.11
            : 0.24;
      if (
        isInsideCourtyardFootprint(current) &&
        actor.arrival === "courtyardSit" &&
        assignedSeatIndex >= 0 &&
        assignedSeat !== undefined &&
        nearAssignedSeat &&
        !courtyardStoneSeatChannelContains(assignedSeatIndex, current)
      ) {
        // The inner corner beside the lower-left planter is close to a final
        // seating turn. If an actor drifts outside the reserved seat channel,
        // return to the promenade-side release point before approaching again
        // instead of retrying a diagonal segment through the planting bed.
        const release = courtyardStoneSeatExitPoint(assignedSeatIndex);
        current.copy(release);
        current.y = courtyardPatientGroundY;
        actor.route = [release, assignedSeat.clone()];
        actor.waypoint = 1;
        actor.avoidanceDetourActive = true;
        actor.blockedTime = 0;
        actor.motionStallTime = 0;
        actor.motionWatchPosition.copy(current);
        actor.slot.ivStand.position.copy(
          courtyardStoneSeatIvParkPoint(assignedSeatIndex),
        );
        return;
      }
      // Last-resort containment: if any earlier steering residue ever places
      // a walking body outside the real promenade, immediately re-anchor it
      // to the next surveyed route point. This prevents an invalid current
      // position from turning into a permanent flowerbed stall.
      if (
        isInsideCourtyardFootprint(current) &&
        !eastWestCourtyardTransit &&
        !leavingCourtyardSeat &&
        !nearAssignedSeat &&
        (!courtyardPatientBodyIsOnWalkway(current) ||
          !courtyardPatientBodyAvoidsStoneSeats(actor, current))
      ) {
        const safeCandidates = [
            actor.route[actor.waypoint],
            actor.route[actor.waypoint + 1],
            actor.route[Math.max(0, actor.waypoint - 1)],
            ...courtyardRoundaboutRing,
            courtyardNorthEntryRelease,
            courtyardNorthExitRelease,
            ...courtyardStoneSeats.map((_, index) =>
              courtyardStoneSeatExitPoint(index),
            ),
          ]
            .filter((point): point is THREE.Vector3 => point !== undefined)
            .filter(
              (point) =>
                isInsideCourtyardFootprint(point) &&
                courtyardPatientBodyIsOnWalkway(point) &&
                courtyardPatientBodyAvoidsStoneSeats(actor, point),
            ),
          recoveryPoint = safeCandidates[0];
        if (recoveryPoint) {
          current.copy(recoveryPoint);
          current.y = courtyardPatientGroundY;
          actor.slot.ivStand.position.copy(inpatientIvPalmFloorPoint(actor));
        }
        actor.avoidanceDetourActive = true;
        actor.blockedTime = 0;
        actor.motionStallTime = 0;
        actor.motionWatchPosition.copy(current);
        return;
      }
      if (distance < waypointThreshold) {
        if (doorWaypoint || exactMovementWaypoint) {
          current.x = target.x;
          current.z = target.z;
        }
        if (seatExitWaypoint) {
          // The full 1.28 m outward segment is complete. Only now may normal
          // curved steering turn the body toward the promenade route.
          actor.walker.group.userData.leavingCourtyardSeat = false;
          actor.walker.group.userData.courtyardSeatExitIndex = undefined;
          actor.walker.group.userData.courtyardSeatExitPoint = undefined;
        }
        if (recoveryWaypoint)
          actor.avoidanceDetourActive = false;
        if (medicalCartRecoveryWaypoint)
          actor.walker.group.userData.medicalCartRecovery = undefined;
        actor.courtyardTrafficWait = 0;
        actor.waypoint++;
        if (actor.waypoint >= actor.route.length) finishPatientRoute(actor);
        return;
      }
      const nearDoorCorner = wardDoorCentres
          .concat(courtyardDoorCentres)
          .some(
            (centre) =>
              actorHorizontalDistance(current, centre) < 1.35 ||
              actorHorizontalDistance(target, centre) < 1.35,
          ),
        routeDirection = exactMovementWaypoint
          ? delta.clone().normalize()
          : thirdFloorRouteDirection(
              current,
              actor.route,
              actor.waypoint,
              nearDoorCorner ? 0.28 : 0.72,
            );
      const direction = routeDirection,
        speedFactor = courtyardSameDirectionSpeedFactor(
          actor,
          current,
          direction,
        ),
        step = Math.min(distance, inpatientWalkSpeed * speedFactor * dt);
      const actorKey = `p:${actor.walker.group.userData.inpatientIndex}`,
        steeringPoint = current.clone().add(direction),
        targetYaw = thirdFloorPatientYaw(current, steeringPoint),
        wardDepth = current
          .clone()
          .sub(actor.slot.doorCentre)
          .dot(actor.slot.out),
        // slot.out points from the door into the room. Wait until the whole
        // patient has cleared the threshold before enabling forward-steered
        // arcs; this keeps the compact bedside/door route exactly on its
        // surveyed points while activating curved motion immediately in the
        // public corridor.
        useCurvedForward =
          !exactMovementWaypoint &&
          !leavingCourtyardSeat &&
          !doorWaypoint &&
          wardDepth < -0.52;
      actor.walker.arms[0].rotation.set(0.78, 0, 0.3);
      const facingReady = turnWardWalkerToward(actor.walker, targetYaw, dt);
      if (
        (straightCourtyardDoorTransit || eastWestCourtyardTransit) &&
        !facingReady
      )
        actor.walker.group.rotation.set(0, targetYaw, 0);
      // Recompute from the actual palm on every turning frame. The stand
      // therefore stays in the same hand instead of rotating a frame later.
      actor.slot.ivStand.position.copy(
        seatLandingWaypoint && assignedSeatIvPark
          ? assignedSeatIvPark
          : inpatientIvPalmFloorPoint(actor),
      );
      actor.slot.ivStand.rotation.y = actor.walker.group.rotation.y;
      // The room, bedside aisle and door threshold use exact movement. Once
      // the character has fully entered the public corridor, translation uses
      // the model's actual local -Z front while yaw continues easing toward
      // the look-ahead direction, producing a genuine walking arc.
      if (
        !useCurvedForward &&
        !straightCourtyardDoorTransit &&
        !eastWestCourtyardTransit &&
        !facingReady
      )
        return;
      if (!useCurvedForward)
        actor.walker.group.rotation.set(0, targetYaw, 0);
      const visualForward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(actor.walker.group.quaternion)
        .setY(0)
        .normalize();
      let movementDirection = useCurvedForward ? visualForward : direction;
      const liveIvPoint = inpatientProjectedIvPoint(
          current,
          actor.walker.group.rotation.y,
        ),
        nurseConflict = patientNurseConflictAt(current, liveIvPoint);
      if (
        nurseConflict &&
        useCurvedForward &&
        !isInsideCourtyardFootprint(current)
      ) {
        // The nurse and cart keep their surveyed lane and heading. A patient
        // who reaches their envelope bends forward-right until clear, then
        // naturally rejoins the same right-hand route.
        const right = new THREE.Vector3(
            -direction.z,
            0,
            direction.x,
          ).normalize(),
          avoidanceDirection = direction
            .clone()
            .multiplyScalar(0.72)
            .addScaledVector(right, 0.58)
            .normalize(),
          avoidanceYaw = thirdFloorPatientYaw(
            current,
            current.clone().add(avoidanceDirection),
        );
        turnWardWalkerToward(actor.walker, avoidanceYaw, dt);
        // Translation always follows the rig's actual front after this turn.
        // Steering may bend the path, but can never slide the model sideways
        // or move it backward relative to its visible body direction.
        movementDirection = new THREE.Vector3(0, 0, -1)
          .applyQuaternion(actor.walker.group.quaternion)
          .setY(0)
          .normalize();
      }
      let movementYaw = actor.walker.group.rotation.y;
      let proposed = current
          .clone()
          .addScaledVector(movementDirection, step)
          .setY(0),
        proposedIv =
          seatLandingWaypoint && assignedSeatIvPark
            ? assignedSeatIvPark.clone()
            : inpatientProjectedIvPoint(proposed, movementYaw);
      const patientCourtyardStepIsInvalid = () =>
          isInsideCourtyardFootprint(proposed) &&
          !eastWestCourtyardTransit &&
          ((seatExitWaypoint || seatApproachWaypoint || seatLandingWaypoint
            ? !isCourtyardWalkwayPoint(proposed) &&
              !isCourtyardDoorPassagePoint(proposed)
            : !courtyardPatientBodyIsOnWalkway(proposed) ||
              !courtyardPatientBodyAvoidsStoneSeats(actor, proposed)) ||
            courtyardStoneSeatStepIsForbidden(actor, proposed)),
        ivCourtyardStepIsInvalid = () =>
          isInsideCourtyardFootprint(proposedIv) &&
          !eastWestCourtyardTransit &&
          ((!isCourtyardWalkwayPoint(proposedIv) &&
            !isCourtyardDoorPassagePoint(proposedIv)) ||
            courtyardStoneSeatStepIsForbidden(actor, proposedIv)),
        courtyardStepIsInvalid = () =>
          patientCourtyardStepIsInvalid() || ivCourtyardStepIsInvalid();
      if (courtyardStepIsInvalid() && useCurvedForward) {
        // If an arc approaches a planting edge, immediately lock back onto
        // the surveyed segment in the same frame. Facing is aligned before
        // translation, so this cannot become sideways/backward movement or a
        // visible pause while the patient waits for the next recovery cycle.
        const recoveryYaw = thirdFloorPatientYaw(
          current,
          current.clone().add(direction),
        );
        actor.walker.group.rotation.set(0, recoveryYaw, 0);
        actor.avoidanceDetourActive = true;
        movementDirection = direction;
        movementYaw = actor.walker.group.rotation.y;
        proposed = current
          .clone()
          .addScaledVector(movementDirection, step)
          .setY(0);
        proposedIv = inpatientProjectedIvPoint(proposed, movementYaw);
        if (seatLandingWaypoint && assignedSeatIvPark)
          proposedIv.copy(assignedSeatIvPark);
      }
      if (courtyardStepIsInvalid()) {
        // The current surveyed segment is re-attempted exactly on the next
        // frame instead of searching left/right or waiting on the walkway.
        actor.avoidanceDetourActive = true;
        actor.blockedTime = Math.min(actor.blockedTime + dt, 0.24);
        return;
      }
      if (
        !canUseThirdFloorDoors(
          actorKey,
          current,
          proposed,
          actor.walker.group.position.z >= -1.8 || target.z >= -1.8,
        )
      ) {
        actor.blockedTime = 0;
        return;
      }
      if (isInsideCourtyardFootprint(current))
        reserveCourtyardRoundabout(actorKey, current, proposed);
      if (inmateBlockingPoint(actor, proposed, proposedIv)) {
        actor.blockedTime += dt;
        if (isInsideCourtyardFootprint(current))
          actor.courtyardTrafficWait += dt;
        // Courtyard patients are excluded from this hard-block branch. Only a
        // fixed obstacle, nurse, cart, or an out-of-courtyard patient can
        // pause movement here.
        actor.blockedTime = Math.min(actor.blockedTime, 0.65);
        return;
      }
      actor.blockedTime = 0;
      actor.courtyardTrafficWait = 0;
      current.copy(proposed);
      current.y = courtyardPatientGroundYAt(current);
      const gait = Math.sin(t * 7.4 + actor.walker.group.userData.inpatientIndex);
      actor.walker.legs[0].rotation.x = gait * 0.45;
      actor.walker.legs[1].rotation.x = -gait * 0.45;
      // The IV remains inside the steady left palm; only the free right arm
      // participates in the normal walking swing.
      actor.walker.arms[1].rotation.set(-gait * 0.34, 0, -0.08);
      actor.walker.headRig.rotation.y = Math.sin(t * 2.1) * 0.035;
      actor.slot.ivStand.position.copy(
        seatLandingWaypoint && assignedSeatIvPark
          ? assignedSeatIvPark
          : inpatientIvPalmFloorPoint(actor),
      );
      actor.slot.ivStand.rotation.y = actor.walker.group.rotation.y;
      const wardDistance = actor.slot.doorCentre.distanceTo(current);
      if (wardDistance < 1.85)
        wardSwingDoors[actor.slot.doorIndex].openTarget = 1;
      courtyardAutoDoors.forEach((door) => {
        const centre = door.leaves[0].closed
          .clone()
          .add(door.leaves[1].closed)
          .multiplyScalar(0.5);
        if (actorHorizontalDistance(current, centre) < 1.75) {
          door.openTarget = 1;
          door.closeAt = performance.now() + 2300;
        }
      });
    };

    const nurseSeatSidePoint = (nurseIndex: number) => {
        const seat = wardNurseSeatPoints[nurseIndex];
        // All three nurses face local -Z at the desk, so +X is the character's
        // right. The innermost nurse now leaves through this side as requested.
        return new THREE.Vector3(seat.x + 0.72, 0, seat.z);
      },
      nurseSeatAislePoint = (nurseIndex: number) => {
        const sidePoint = nurseSeatSidePoint(nurseIndex);
        return new THREE.Vector3(sidePoint.x, 0, -5.46);
      },
      // The inspecting nurse waits inside the station, exits through its open
      // right side and walks around the counter before approaching the outside
      // face of the first cart. Every nurse first steps around their own chair
      // into the widened front aisle, so seated colleagues no longer block the
      // cross-station segment and work rotation never requires changing seats.
      nurseInspectionPrepPoint = new THREE.Vector3(3.08, 0, -5.46),
      nurseCartDeparturePoint = new THREE.Vector3(-3.72, 0, -4.34),
      nurseCartDepartureDirection = nurseCartDeparturePoint
        .clone()
        .sub(outerWardMedicalCartHome)
        .setY(0)
        .normalize(),
      nurseCartPickupPoint = outerWardMedicalCartHome
        .clone()
        .addScaledVector(nurseCartDepartureDirection, -wardNurseCartDistance)
        .setY(0),
      nurseCartReturnDropPoint = outerWardMedicalCartHome
        .clone()
        .addScaledVector(nurseCartDepartureDirection, wardNurseCartDistance)
        .setY(0),
      nurseCartReturnStagingPoint = nurseCartReturnDropPoint
        .clone()
        .addScaledVector(nurseCartDepartureDirection, 0.9)
        .setY(0),
      nurseStationToCartRoute = (nurseIndex: number) => [
        nurseSeatSidePoint(nurseIndex),
        nurseSeatAislePoint(nurseIndex),
        nurseInspectionPrepPoint.clone(),
        new THREE.Vector3(3.66, 0, -5.46),
        new THREE.Vector3(4.08, 0, -4.24),
        new THREE.Vector3(-3.38, 0, -3.84),
        new THREE.Vector3(-4.28, 0, -3.64),
        new THREE.Vector3(-5.12, 0, -3.88),
        new THREE.Vector3(-5.42, 0, -4.34),
        nurseCartPickupPoint.clone(),
      ],
      nurseCartToStationRoute = (nurseIndex: number) => [
        nurseCartReturnStagingPoint.clone(),
        nurseCartReturnDropPoint.clone(),
        new THREE.Vector3(-2.72, 0, -3.96),
        new THREE.Vector3(4.18, 0, -4.16),
        new THREE.Vector3(3.82, 0, -5.46),
        nurseInspectionPrepPoint.clone(),
        nurseSeatAislePoint(nurseIndex),
        nurseSeatSidePoint(nurseIndex),
      ];
    let inspectionNurseIndex = initialInspectionNurseIndex,
      inspectionLastPatient = -1,
      inspectionPhase:
        | "idle"
        | "awaitPatient"
        | "outbound"
        | "awaitBedsideSupine"
        | "checking"
        | "returning" = "idle",
      inspectionPatient: InpatientActor | undefined,
      inspectionTimer = initialInspectionDelay,
      inspectionTripTargetCount = 2,
      inspectionTripCompleted = 0,
      inspectionCheckDuration = 8,
      inspectionPreviousSlot: WardBedSlot | undefined,
      medicationQueue: number[] = [],
      medicationTripOpen = false,
      medicationTripClosed = false,
      medicationTripEnqueued = 0,
      medicationTripCompleted = 0,
      // When the nurse revisits a room that is still being served, the exiting
      // robot owns the doorway. After crossing the threshold it parks on the
      // side opposite the nurse's actual approach, then resumes only after the
      // nurse and attached cart are fully inside.
      medicationRoomHandoff: number | undefined,
      medicationHandoffNurseApproachSide: -1 | 1 | undefined;
    const inspectionTripVisited = new Set<number>();
    const currentNurseStationJob = (index: number) =>
        index === inspectionNurseIndex
          ? "inspection"
          : index === (inspectionNurseIndex + 1) % 3
            ? "computer"
            : "chart",
      wardNurseStatus = (nurse: WardNurseActor) => {
        if (
          nurse.mode === "outbound" &&
          inspectionPatient &&
          medicationRoomHandoff === inspectionPatient.slot.room &&
          actorHorizontalDistance(
            nurse.walker.group.position,
            nurseMedicationHandoffSafePoint(inspectionPatient.slot),
          ) < 0.16
        )
          return `正在病房門外${medicationHandoffNurseApproachSide === 1 ? "右" : "左"}側安全點等待給藥機器人離開`;
        if (nurse.mode === "outbound") return "正推著醫療車前往病房巡房";
        if (nurse.mode === "checking") return "正在病房為病患進行檢查";
        if (nurse.mode === "waitingNext") return "正在病房等待下一位病患就位";
        if (nurse.mode === "returning") return "正將醫療車推回護理站";
        const job = currentNurseStationJob(nurse.index);
        if (job === "computer") return "正在護理站操作電腦";
        if (job === "chart") return "正在護理站查看病例";
        return inspectionPhase === "awaitPatient"
          ? "正在等待病患回床準備巡房"
          : "正在護理站準備巡房";
      },
      releaseSocialPartner = (actor: InpatientActor) => {
        if (actor.partner === undefined) return;
        const partner = inpatientPatients[actor.partner];
        actor.partner = undefined;
        if (partner && partner.partner !== undefined) {
          partner.partner = undefined;
          if (!partner.inspectionReserved) {
            partner.state = "courtyardSit";
            partner.timer = 3;
          }
        }
      },
      recoverStalledPatient = (actor: InpatientActor) => {
        actor.walker.group.userData.waitingForCourtyardDoor = false;
        if (actor.state === "walking" && !courtyardSeatTaskIsValid(actor)) {
          continueAfterCancelledConversation(actor);
          return;
        }
        const actorKey = `p:${actor.walker.group.userData.inpatientIndex}`,
          activeCourtyardDoor =
            courtyardDoorCentres[actor.assignedCourtyardDoor ?? 0],
          nearActiveDoor = wardDoorCentres.some(
            (centre) =>
              actorHorizontalDistance(actor.walker.group.position, centre) <
              wardDoorReleaseRadius,
          ) ||
            actorHorizontalDistance(
              actor.walker.group.position,
              activeCourtyardDoor,
            ) < courtyardDoorQueueReleaseRadius;
        wardDoorReservations.forEach((reservation) => {
          reservation.occupants.delete(actorKey);
          if (reservation.occupants.size === 0)
            reservation.direction = undefined;
        });
        courtyardDoorQueues.forEach((doorQueue) => {
          doorQueue.queue = doorQueue.queue.filter(
            (occupant) => occupant !== actorKey,
          );
          doorQueue.directions.delete(actorKey);
        });
        if (actor.state === "walking" && actor.route[actor.waypoint]) {
          releaseCourtyardRoundaboutForActor(actorKey);
          actor.doorPassOverride = nearActiveDoor ? 2.4 : 0;
          if (isInsideCourtyardFootprint(actor.walker.group.position)) {
            const current = actor.walker.group.position,
              nearestSeatIndex = courtyardStoneSeats.reduce(
                (best, seat, index) =>
                  actorHorizontalDistance(current, seat) <
                  actorHorizontalDistance(
                    current,
                    courtyardStoneSeats[best],
                  )
                    ? index
                    : best,
                0,
              ),
              nearestSeatDistance = actorHorizontalDistance(
                current,
                courtyardStoneSeats[nearestSeatIndex],
              ),
              assignedSitterNearSeat =
                actor.arrival === "courtyardSit" &&
                actor.assignedCourtyardSeat !== undefined &&
                nearestSeatIndex === actor.assignedCourtyardSeat &&
                nearestSeatDistance < 1.48;
            let recoveryPoint: THREE.Vector3 | undefined;
            if (assignedSitterNearSeat) {
              // An assigned sitter near the target must stay inside the
              // narrow one-way channel. A patient already settled at the cap
              // may finish immediately; every lateral or planting-side drift
              // first returns to the promenade release point.
              const seatIndex = actor.assignedCourtyardSeat!,
                seat = courtyardStoneSeats[seatIndex],
                remaining =
                  courtyardStoneSeatChannelContains(seatIndex, current) &&
                  actorHorizontalDistance(current, seat) <= 0.18
                    ? [seat.clone()]
                    : [courtyardStoneSeatExitPoint(seatIndex), seat.clone()];
              actor.route = remaining;
              actor.waypoint = 0;
              actor.avoidanceDetourActive = false;
            } else if (nearestSeatDistance < 1.48) {
              // If a previous curved segment reached a stone cap, first move
              // to that cap's promenade-side release point before resuming the
              // original task. This works for every one of the four benches.
              recoveryPoint = courtyardStoneSeatExitPoint(nearestSeatIndex);
            } else {
              // There is no patient-to-patient collision in the courtyard,
              // so never invent a left/right detour. Re-run the existing
              // surveyed segment as an exact waypoint instead.
              actor.avoidanceDetourActive = true;
            }
            if (
              !assignedSitterNearSeat &&
              recoveryPoint &&
              actorHorizontalDistance(current, recoveryPoint) > 0.18
            ) {
              actor.route.splice(actor.waypoint, 0, recoveryPoint);
              actor.avoidanceDetourActive = true;
            } else if (!assignedSitterNearSeat && !actor.avoidanceDetourActive)
              actor.avoidanceDetourActive = true;
          } else actor.avoidanceDetourActive = false;
          actor.motionStallTime = 0;
          actor.motionWatchPosition.copy(actor.walker.group.position);
          actor.blockedTime = 0;
          actor.courtyardTrafficWait = 0;
          return;
        }
        releaseSocialPartner(actor);
        actor.motionStallTime = 0;
        actor.motionWatchPosition.copy(actor.walker.group.position);
        beginPatientHomeRoute(
          actor,
          actor.inspectionReserved ? "waitingCheck" : "bedRest",
        );
      },
      reservePatientForInspection = (actor: InpatientActor) => {
        actor.inspectionReserved = true;
        releaseSocialPartner(actor);
        if (actor.state === "bedRest" || actor.state === "bedEat") {
          if (actor.state === "bedRest") {
            actor.state = "waitingCheck";
            actor.timer = 0;
          } else {
            // A diner remains seated and eating while the nurse approaches.
            // The tray is removed and the patient reclines only after the cart
            // has reached this bedside.
            actor.timer = Math.max(actor.timer, 1);
          }
        } else if (actor.state === "settling") {
          actor.arrival = "waitingCheck";
        } else beginPatientHomeRoute(actor, "waitingCheck");
      },
      compactThirdFloorRoute = (points: THREE.Vector3[]) =>
        points.filter(
          (point, index, route) =>
            index === 0 ||
            actorHorizontalDistance(point, route[index - 1]) > 0.04,
        ),
      nurseCorridorFromStation = (slot: WardBedSlot) => {
        const eastbound = slot.room !== 1,
          laneZ = wardCorridorLaneZ(eastbound),
          mergePoint = new THREE.Vector3(
            nurseCartDeparturePoint.x,
            0,
            laneZ,
          );
        return slot.room === 1
          ? [
              mergePoint,
              new THREE.Vector3(-4.18, 0, laneZ),
              new THREE.Vector3(-5.74, 0, -3.08),
            ]
          : compactThirdFloorRoute([
              mergePoint,
              ...nurseRoomCorridorPath(slot, eastbound).slice().reverse(),
            ]);
      },
      nurseCorridorToStation = (slot: WardBedSlot) => {
        const eastbound = slot.room === 1,
          route = nurseRoomCorridorPath(slot, eastbound);
        // The cart is already west of the central hub. Ward 1 therefore joins
        // the return lane directly instead of travelling east past it first.
        return slot.room === 1 ? route.slice(0, -1) : route;
      },
      nurseCorridorBetweenRooms = (
        fromSlot: WardBedSlot,
        toSlot: WardBedSlot,
      ) => {
        if (fromSlot.room === toSlot.room) return [];
        const eastbound = toSlot.room > fromSlot.room,
          fromRoute = nurseRoomCorridorPath(fromSlot, eastbound),
          toRoute = nurseRoomCorridorPath(toSlot, eastbound);
        if (fromSlot.room === 2 && toSlot.room === 3)
          return compactThirdFloorRoute([
            fromRoute[0],
            ...toRoute.slice(0, -1).reverse(),
          ]);
        if (fromSlot.room === 3 && toSlot.room === 2)
          return compactThirdFloorRoute([
            ...fromRoute.slice(0, -1),
            toRoute[0],
          ]);
        return compactThirdFloorRoute([
          ...fromRoute,
          ...toRoute.slice().reverse(),
        ]);
      },
      // The final three points stay within the compact bedside lane: at exactly
      // 2.5 m from the checking point the nurse turns around, then reverses into
      // the bedside lane and parks the cart only 0.82 m toward the foot. The
      // reduced side offset avoids crossing the privacy curtain in narrow rooms.
      inspectionBedsidePoint = (slot: WardBedSlot) =>
        slot.bedCentre
          .clone()
          .addScaledVector(slot.bedSide, slot.cabinetSide * -1.28)
          .addScaledVector(slot.out, -0.08)
          .setY(0),
      inspectionCartParkPoint = (slot: WardBedSlot) =>
        inspectionBedsidePoint(slot)
          .addScaledVector(slot.out, -0.82)
          .setY(0),
      inspectionBedsideEntryPoint = (slot: WardBedSlot) =>
        inspectionBedsidePoint(slot)
          .addScaledVector(slot.out, -2.5)
          .setY(0),
      wardDoorViewRight = (slot: WardBedSlot) =>
        new THREE.Vector3(slot.out.z, 0, -slot.out.x).normalize(),
      nurseDoorRightSafePoint = (slot: WardBedSlot) =>
        roomOutsidePoint(slot)
          .addScaledVector(wardDoorViewRight(slot), 1.48)
          .setY(0),
      nurseDoorLeftSafePoint = (slot: WardBedSlot) =>
        roomOutsidePoint(slot)
          .addScaledVector(wardDoorViewRight(slot), -1.48)
          .setY(0),
      wardDoorSideSafePoint = (slot: WardBedSlot, side: -1 | 1) =>
        side > 0
          ? nurseDoorRightSafePoint(slot)
          : nurseDoorLeftSafePoint(slot),
      nurseMedicationHandoffSafePoint = (slot: WardBedSlot) =>
        wardDoorSideSafePoint(
          slot,
          medicationRoomHandoff === slot.room &&
            medicationHandoffNurseApproachSide !== undefined
            ? medicationHandoffNurseApproachSide
            : slot.room === 1
              ? 1
              : -1,
        ),
      medicationRobotHandoffSafePoint = (slot: WardBedSlot) =>
        wardDoorSideSafePoint(
          slot,
          medicationRoomHandoff === slot.room &&
            medicationHandoffNurseApproachSide !== undefined
            ? medicationHandoffNurseApproachSide === 1
              ? -1
              : 1
            : slot.room === 1
              ? -1
              : 1,
        ),
      nurseExitSideForRobotWait = (
        nurse: WardNurseActor,
        slot: WardBedSlot,
      ): -1 | 1 => {
        const doorOutside = roomOutsidePoint(slot),
          sideAxis = wardDoorViewRight(slot);
        for (const point of nurse.route.slice(nurse.waypoint)) {
          const relative = point.clone().sub(doorOutside).setY(0),
            outsideDepth = relative.dot(slot.out),
            lateral = relative.dot(sideAxis);
          if (outsideDepth < -0.42 && Math.abs(lateral) > 0.2)
            return lateral > 0 ? 1 : -1;
        }
        return slot.room === 1 ? 1 : -1;
      },
      medicationRobotWaitPointForNurse = (
        nurse: WardNurseActor,
        slot: WardBedSlot,
      ) =>
        wardDoorSideSafePoint(
          slot,
          nurseExitSideForRobotWait(nurse, slot) === 1 ? -1 : 1,
        ),
      inspectionRouteToBed = (slot: WardBedSlot) => {
        const bedsideEntry = inspectionBedsideEntryPoint(slot),
          bedside = inspectionBedsidePoint(slot);
        return [
          nurseCartDeparturePoint.clone(),
          ...nurseCorridorFromStation(slot),
          nurseDoorRightSafePoint(slot),
          roomOutsidePoint(slot),
          slot.doorCentre.clone().setY(0),
          roomInsidePoint(slot),
          bedsideEntry,
          bedside,
        ];
      },
      inspectionRouteBetweenBeds = (
        fromSlot: WardBedSlot,
        toSlot: WardBedSlot,
      ) =>
        fromSlot.room === toSlot.room
          ? compactThirdFloorRoute([
              inspectionBedsideEntryPoint(fromSlot),
              inspectionBedsideEntryPoint(toSlot),
              inspectionBedsidePoint(toSlot),
            ])
          : compactThirdFloorRoute([
              inspectionBedsideEntryPoint(fromSlot),
              roomInsidePoint(fromSlot),
              fromSlot.doorCentre.clone().setY(0),
              roomOutsidePoint(fromSlot),
              ...nurseCorridorBetweenRooms(fromSlot, toSlot),
              nurseDoorRightSafePoint(toSlot),
              roomOutsidePoint(toSlot),
              toSlot.doorCentre.clone().setY(0),
              roomInsidePoint(toSlot),
              inspectionBedsideEntryPoint(toSlot),
              inspectionBedsidePoint(toSlot),
            ]),
      medicationRobotStationInside = new THREE.Vector3(3.72, 0, -6.28),
      medicationRobotStationExit = new THREE.Vector3(4.08, 0, -5.34),
      medicationRobotCorridorJoin = new THREE.Vector3(4.18, 0, wardNurseCorridorZ),
      medicationRobotBedsidePoint = (slot: WardBedSlot) =>
        slot.bedCentre
          .clone()
          .addScaledVector(slot.bedSide, slot.cabinetSide * -1.24)
          .addScaledVector(slot.out, -0.16)
          .setY(0),
      medicationRobotBedsideEntryPoint = (slot: WardBedSlot) =>
        medicationRobotBedsidePoint(slot)
          .addScaledVector(slot.out, -1.72)
          .setY(0),
      medicationRobotCorridorFromStation = (slot: WardBedSlot) => {
        const eastbound = slot.room !== 1,
          laneZ = wardCorridorLaneZ(eastbound),
          corridorJoin = new THREE.Vector3(
            medicationRobotCorridorJoin.x,
            0,
            laneZ,
          );
        if (slot.room === 1)
          return [
            corridorJoin,
            new THREE.Vector3(0, 0, laneZ),
            new THREE.Vector3(-4.18, 0, laneZ),
            new THREE.Vector3(-5.74, 0, -3.08),
          ];
        if (slot.room === 2)
          return [
            corridorJoin,
            new THREE.Vector3(5.74, 0, -3.1),
          ];
        return [
          corridorJoin,
          new THREE.Vector3(5.18, 0, laneZ),
          new THREE.Vector3(7.36, 0, -1.96),
          new THREE.Vector3(9.42, 0, 0.08),
          new THREE.Vector3(11.08, 0, 2.42),
        ];
      },
      medicationRobotCorridorToStation = (slot: WardBedSlot) => {
        const eastbound = slot.room === 1,
          laneZ = wardCorridorLaneZ(eastbound),
          corridorJoin = new THREE.Vector3(
            medicationRobotCorridorJoin.x,
            0,
            laneZ,
          );
        if (slot.room === 1)
          return [
            new THREE.Vector3(-5.74, 0, -3.08),
            new THREE.Vector3(-4.18, 0, laneZ),
            new THREE.Vector3(0, 0, laneZ),
            corridorJoin,
          ];
        if (slot.room === 2)
          return [new THREE.Vector3(5.74, 0, -3.1), corridorJoin];
        return [
          new THREE.Vector3(11.08, 0, 2.42),
          new THREE.Vector3(9.42, 0, 0.08),
          new THREE.Vector3(7.36, 0, -1.96),
          new THREE.Vector3(5.18, 0, laneZ),
          corridorJoin,
        ];
      },
      medicationRobotRouteFromHome = (slot: WardBedSlot) =>
        compactThirdFloorRoute([
          medicationRobotStationInside.clone(),
          medicationRobotStationExit.clone(),
          ...medicationRobotCorridorFromStation(slot),
          roomOutsidePoint(slot),
          slot.doorCentre.clone().setY(0),
          roomInsidePoint(slot),
          medicationRobotBedsideEntryPoint(slot),
          medicationRobotBedsidePoint(slot),
        ]),
      medicationRobotRouteBetweenBeds = (
        fromSlot: WardBedSlot,
        toSlot: WardBedSlot,
      ) =>
        fromSlot.room === toSlot.room
          ? compactThirdFloorRoute([
              medicationRobotBedsideEntryPoint(fromSlot),
              medicationRobotBedsideEntryPoint(toSlot),
              medicationRobotBedsidePoint(toSlot),
            ])
          : compactThirdFloorRoute([
              medicationRobotBedsideEntryPoint(fromSlot),
              roomInsidePoint(fromSlot),
              fromSlot.doorCentre.clone().setY(0),
              roomOutsidePoint(fromSlot),
              medicationRobotHandoffSafePoint(fromSlot),
              ...nurseCorridorBetweenRooms(fromSlot, toSlot),
              roomOutsidePoint(toSlot),
              toSlot.doorCentre.clone().setY(0),
              roomInsidePoint(toSlot),
              medicationRobotBedsideEntryPoint(toSlot),
              medicationRobotBedsidePoint(toSlot),
            ]),
      medicationRobotRouteHome = (slot: WardBedSlot) =>
        compactThirdFloorRoute([
          medicationRobotBedsideEntryPoint(slot),
          roomInsidePoint(slot),
          slot.doorCentre.clone().setY(0),
          roomOutsidePoint(slot),
          medicationRobotHandoffSafePoint(slot),
          ...medicationRobotCorridorToStation(slot),
          medicationRobotStationExit.clone(),
          medicationRobotStationInside.clone(),
          medicationRobotHome.clone(),
        ]),
      pointIsInsideWardRoom = (point: THREE.Vector3, room: number) => {
        const slot = wardBedSlots.find((candidate) => candidate.room === room);
        if (!slot) return false;
        const relative = point.clone().sub(slot.doorCentre).setY(0),
          depth = relative.dot(slot.out),
          lateral = Math.abs(relative.dot(slot.tan)),
          halfWidth = room === 3 ? 3.18 : 5.82;
        return depth > -0.18 && depth < 7.75 && lateral < halfWidth;
      },
      medicationRobotTargetRoom = () => {
        const target =
          medicationRobot.targetPatient !== undefined
            ? inpatientPatients[medicationRobot.targetPatient]
            : undefined;
        return target?.slot.room ?? medicationRobot.previousSlot?.room;
      },
      nurseOccupiesRoom = (room: number) => {
        return wardNurses.some(
          (nurse) =>
            nurse.mode !== "station" &&
            (pointIsInsideWardRoom(nurse.walker.group.position, room) ||
              (nurse.cartAttached &&
                pointIsInsideWardRoom(nurse.cart.position, room))),
        );
      },
      chooseInspectionPatient = () =>
        inpatientPatients
          .map((patient, index) => ({ patient, index }))
          .filter(
            ({ patient, index }) =>
              index !== inspectionLastPatient &&
              !inspectionTripVisited.has(index) &&
              !patient.inspectionReserved &&
              !patient.medicationReserved &&
              ["bedRest", "bedEat"].includes(patient.state),
          )
          .sort(
            (a, b) =>
              a.patient.lastActivitySequence -
                b.patient.lastActivitySequence ||
              ((a.index * 5 + inspectionLastPatient + 17) % 13) -
                ((b.index * 5 + inspectionLastPatient + 17) % 13),
          )[0],
      startNurseInspectionRoute = (
        nurse: WardNurseActor,
        patient: InpatientActor,
      ) => {
        const pickupRoute = nurseStationToCartRoute(nurse.index),
          route = pickupRoute.concat(inspectionRouteToBed(patient.slot));
        setWardWalkerStanding(
          nurse.walker,
          thirdFloorYaw(
            nurse.walker.group.position,
            firstDistinctRouteTarget(nurse.walker.group.position, route),
          ),
        );
        nurse.mode = "outbound";
        nurse.targetPatient = patient.walker.group.userData.inpatientIndex;
        nurse.route = route;
        nurse.waypoint = 0;
        nurse.cartAttachWaypoint = pickupRoute.length - 1;
        nurse.cartAttached = false;
        nurse.cartParked = false;
        nurse.reverseWaypoint = route.length - 1;
        nurse.timer = 0;
        if (nurse.walker.chart) nurse.walker.chart.visible = false;
        inspectionPhase = "outbound";
      },
      startNurseNextInspectionRoute = (
        nurse: WardNurseActor,
        fromSlot: WardBedSlot,
        patient: InpatientActor,
      ) => {
        nurse.mode = "outbound";
        nurse.targetPatient = patient.walker.group.userData.inpatientIndex;
        nurse.route = inspectionRouteBetweenBeds(fromSlot, patient.slot);
        nurse.waypoint = 0;
        nurse.cartAttachWaypoint = -1;
        nurse.cartAttached = true;
        nurse.cartParked = true;
        nurse.reverseWaypoint = nurse.route.length - 1;
        nurse.timer = 0;
        inspectionPhase = "outbound";
      },
      releaseCheckedPatient = (patient: InpatientActor) => {
        patient.inspectionReserved = false;
        patient.state = "bedRest";
        patient.timer = 6;
        patient.postInspectionCooldown = patient.timer;
        patient.walker.headRig.rotation.set(0, 0, 0);
      },
      enqueueMedicationPatient = (patient: InpatientActor) => {
        const patientIndex =
          patient.walker.group.userData.inpatientIndex as number;
        if (
          patient.medicationReserved ||
          medicationQueue.includes(patientIndex) ||
          medicationRobot.targetPatient === patientIndex
        )
          return;
        patient.medicationReserved = true;
        patient.medicationPill.visible = false;
        patient.state = "waitingMedication";
        patient.timer = 0;
        patient.postInspectionCooldown = 0;
        medicationQueue.push(patientIndex);
        medicationTripOpen = true;
        medicationTripEnqueued++;
      },
      medicationPatientSeatPose = (
        patient: InpatientActor,
        robotPoint: THREE.Vector3,
      ) => {
        const position = patient.slot.bedCentre
          .clone()
          .addScaledVector(patient.slot.out, -0.24)
          .setY(0.58);
        return {
          position,
          quaternion: new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              0,
              thirdFloorPatientYaw(position, robotPoint),
              0,
            ),
          ),
          scale: new THREE.Vector3(0.828, 0.792, 0.828),
        };
      },
      startMedicationPatientInteraction = (patient: InpatientActor) => {
        const seatPose = medicationPatientSeatPose(
          patient,
          medicationRobot.group.position,
        );
        patient.state = "medicationSittingUp";
        patient.timer = 0;
        patient.transitionFromPosition.copy(patient.walker.group.position);
        patient.transitionFromQuaternion.copy(patient.walker.group.quaternion);
        patient.transitionFromScale.copy(patient.walker.group.scale);
        patient.transitionToPosition.copy(seatPose.position);
        patient.transitionToQuaternion.copy(seatPose.quaternion);
        patient.transitionToScale.copy(seatPose.scale);
        patient.medicationPill.visible = false;
      },
      startMedicationPatientSettling = (patient: InpatientActor) => {
        const lie = lyingPose(patient.slot);
        patient.state = "medicationSettling";
        patient.timer = 0;
        patient.transitionFromPosition.copy(patient.walker.group.position);
        patient.transitionFromQuaternion.copy(patient.walker.group.quaternion);
        patient.transitionFromScale.copy(patient.walker.group.scale);
        patient.transitionToPosition.copy(lie.position);
        patient.transitionToQuaternion.copy(lie.quaternion);
        patient.transitionToScale.copy(lie.scale);
        patient.medicationPill.visible = false;
      },
      completeMedicationPatient = (patient: InpatientActor) => {
        const lie = lyingPose(patient.slot);
        patient.walker.group.position.copy(lie.position);
        patient.walker.group.quaternion.copy(lie.quaternion);
        patient.walker.group.scale.copy(lie.scale);
        setWardWalkerLyingLimbs(patient.walker);
        patient.walker.arms.forEach((arm) => arm.rotation.set(0, 0, 0));
        patient.medicationPill.visible = false;
        patient.medicationReserved = false;
        patient.state = "bedRest";
        patient.timer = 14 + careRandom() * 5;
        patient.postInspectionCooldown = 6;
        medicationTripCompleted++;
      },
      startNurseReturn = (
        nurse: WardNurseActor,
        slot: WardBedSlot | undefined,
      ) => {
        if (!slot) return;
        if (medicationTripOpen) medicationTripClosed = true;
        nurse.mode = "returning";
        nurse.route = [
          inspectionBedsideEntryPoint(slot),
          roomInsidePoint(slot),
          slot.doorCentre.clone().setY(0),
          roomOutsidePoint(slot),
          ...nurseCorridorToStation(slot),
          ...nurseCartToStationRoute(nurse.index),
        ];
        nurse.waypoint = 0;
        nurse.cartAttachWaypoint = -1;
        nurse.cartParked = true;
        nurse.reverseWaypoint = -1;
        nurse.timer = 0;
        inspectionPhase = "returning";
      },
      completeNurseCheck = (nurse: WardNurseActor) => {
        const completedPatient = inspectionPatient;
        if (!completedPatient) {
          startNurseReturn(nurse, inspectionPreviousSlot);
          return;
        }
        const completedIndex =
          completedPatient.walker.group.userData.inpatientIndex;
        inspectionPreviousSlot = completedPatient.slot;
        inspectionTripVisited.add(completedIndex);
        inspectionTripCompleted++;
        inspectionLastPatient = completedIndex;
        releaseCheckedPatient(completedPatient);
        enqueueMedicationPatient(completedPatient);
        inspectionPatient = undefined;

        if (inspectionTripCompleted < inspectionTripTargetCount) {
          const nextChoice = chooseInspectionPatient();
          if (nextChoice) {
            inspectionPatient = nextChoice.patient;
            reservePatientForInspection(nextChoice.patient);
            nurse.mode = "waitingNext";
            nurse.timer = 0;
            inspectionPhase = "awaitPatient";
            return;
          }
        }
        startNurseReturn(nurse, inspectionPreviousSlot);
      },
      finishNurseReturn = (nurse: WardNurseActor) => {
        nurse.cart.position.copy(nurse.cartHome);
        nurse.cart.rotation.y = Math.PI / 2;
        nurse.cartAttached = false;
        nurse.mode = "station";
        nurse.route = [];
        nurse.waypoint = 0;
        nurse.cartAttachWaypoint = -1;
        nurse.cartParked = false;
        nurse.reverseWaypoint = -1;
        nurse.motionStallTime = 0;
        nurse.motionWatchPosition.copy(nurse.walker.group.position);
        nurse.navigationOverride = 0;
        inspectionPatient = undefined;
        inspectionPreviousSlot = undefined;
        inspectionTripVisited.clear();
        inspectionTripCompleted = 0;
        inspectionNurseIndex = (inspectionNurseIndex + 1) % wardNurses.length;
        inspectionPhase = "idle";
        inspectionTimer = 8 + careRandom() * 4;
      },
      medicationRobotIsInsideAnyRoom = () =>
        [1, 2, 3].some((room) =>
          pointIsInsideWardRoom(medicationRobot.group.position, room),
        ),
      medicationRobotIsInPublicCorridor = () =>
        medicationRobot.mode !== "home" &&
        !medicationRobotIsInsideAnyRoom() &&
        actorHorizontalDistance(
          medicationRobot.group.position,
          medicationRobot.home,
        ) > 1.25,
      medicationRobotDistanceToNurse = (nurse: WardNurseActor) =>
        Math.min(
          actorHorizontalDistance(
            medicationRobot.group.position,
            nurse.walker.group.position,
          ),
          nurse.cartAttached
            ? actorHorizontalDistance(
                medicationRobot.group.position,
                nurse.cart.position,
              )
            : Number.POSITIVE_INFINITY,
        ),
      activeOutboundNurseDistance = () =>
        wardNurses.reduce(
          (nearest, nurse) =>
            nurse.mode === "outbound"
              ? Math.min(nearest, medicationRobotDistanceToNurse(nurse))
              : nearest,
          Number.POSITIVE_INFINITY,
        ),
      medicationRobotIntersectsNursingStation = (point: THREE.Vector3) =>
        [
          // Front counter, left return and the short right-rear return. These
          // bounds include the robot's body radius, not only each mesh centre.
          { minX: -3.7, maxX: 3.7, minZ: -5.58, maxZ: -4.12 },
          { minX: -3.7, maxX: -2.0, minZ: -7.75, maxZ: -4.54 },
          { minX: 2.0, maxX: 3.68, minZ: -7.75, maxZ: -6.02 },
        ].some(
          (zone) =>
            point.x > zone.minX &&
            point.x < zone.maxX &&
            point.z > zone.minZ &&
            point.z < zone.maxZ,
        ),
      medicationRobotPointIsClear = (point: THREE.Vector3) => {
        if (medicationRobotIntersectsNursingStation(point)) return false;
        // Room interiors are legitimate destinations. Everywhere else the
        // robot must remain outside the courtyard glazing envelope; only its
        // surveyed doorway points can carry it through ward walls.
        if ([1, 2, 3].some((room) => pointIsInsideWardRoom(point, room)))
          return true;
        return isNurseClearOfCourtyardGlass(point, 0.58);
      },
      medicationRobotTransitionIsClear = (
        from: THREE.Vector3,
        to: THREE.Vector3,
      ) => {
        if (!medicationRobotPointIsClear(to)) return false;
        const fromRoom = [1, 2, 3].find((room) =>
            pointIsInsideWardRoom(from, room),
          ),
          toRoom = [1, 2, 3].find((room) =>
            pointIsInsideWardRoom(to, room),
          );
        if (fromRoom === toRoom) return true;
        const crossingRoom = toRoom ?? fromRoom,
          slot = wardBedSlots.find(
            (candidate) => candidate.room === crossingRoom,
          );
        if (!slot) return false;
        const relative = to.clone().sub(slot.doorCentre).setY(0),
          depth = relative.dot(slot.out),
          lateral = Math.abs(relative.dot(slot.tan));
        // Crossing a room boundary is legal only inside the physical doorway.
        // This prevents a valid room interior from accidentally authorising a
        // shortcut through its surrounding wall.
        return Math.abs(depth) < 1.42 && lateral < 1.06;
      },
      medicationRobotActorObstacles = () => [
        ...wardNurses.map((nurse) => ({
          point: nurse.walker.group.position,
          clearance: 0.92,
        })),
        ...thirdFloorMedicalCarts.map((cart) => ({
          point: cart.position,
          clearance: 1.02,
        })),
        ...inpatientPatients.map((patient) => ({
          point: patient.walker.group.position,
          clearance: 0.84,
        })),
      ],
      medicationRobotActorStepIsBlocked = (
        from: THREE.Vector3,
        to: THREE.Vector3,
        escaping = false,
      ) =>
        medicationRobotActorObstacles().some(({ point, clearance }) => {
          const currentGap = actorHorizontalDistance(from, point),
            nextGap = actorHorizontalDistance(to, point);
          // If an actor enters the robot's clearance while it is stationary,
          // permit only motion that increases the separation. This lets the
          // cabinet reverse out without ever passing through that actor.
          if (escaping && currentGap < clearance)
            return nextGap <= currentGap + 0.003;
          return nextGap < clearance;
        }),
      medicationRobotActorSegmentIsBlocked = (
        from: THREE.Vector3,
        to: THREE.Vector3,
        escaping = false,
      ) => {
        const distance = actorHorizontalDistance(from, to),
          samples = Math.max(1, Math.ceil(distance / 0.12));
        let previous = from.clone();
        for (let index = 1; index <= samples; index++) {
          const sample = from.clone().lerp(to, index / samples).setY(0);
          if (
            !medicationRobotTransitionIsClear(previous, sample) ||
            medicationRobotActorStepIsBlocked(previous, sample, escaping)
          )
            return true;
          previous = sample;
        }
        return false;
      },
      findMedicationRobotSafetyPoint = (
        current: THREE.Vector3,
        forward: THREE.Vector3,
      ) => {
        const reverse = forward.clone().setY(0).normalize().multiplyScalar(-1);
        for (const distance of [0.7, 1, 1.35, 1.7, 2.05]) {
          const candidate = current
            .clone()
            .addScaledVector(reverse, distance)
            .setY(0);
          if (
            !medicationRobotActorSegmentIsBlocked(current, candidate, true) &&
            !medicationRobotActorStepIsBlocked(candidate, candidate)
          )
            return candidate;
        }
        return undefined;
      },
      medicationRobotHasClearedHandoffDoor = (room: number) => {
        const slot = wardBedSlots.find((candidate) => candidate.room === room);
        if (!slot) return true;
        const outsideDepth = medicationRobot.group.position
          .clone()
          .sub(slot.doorCentre)
          .setY(0)
          .dot(slot.out);
        return outsideDepth < -0.62;
      },
      nurseApproachSideForHandoff = (
        nurse: WardNurseActor,
        slot: WardBedSlot,
      ): -1 | 1 => {
        const doorOutside = roomOutsidePoint(slot),
          sideAxis = wardDoorViewRight(slot),
          samples = [
            nurse.walker.group.position,
            ...(nurse.cartAttached ? [nurse.cart.position] : []),
            ...nurse.route.slice(
              nurse.waypoint,
              Math.min(nurse.route.length, nurse.waypoint + 3),
            ),
          ];
        for (const point of samples) {
          const lateral = point
            .clone()
            .sub(doorOutside)
            .setY(0)
            .dot(sideAxis);
          if (Math.abs(lateral) > 0.22) return lateral > 0 ? 1 : -1;
        }
        return slot.room === 1 ? 1 : -1;
      },
      configureMedicationRoomHandoff = (
        nurse: WardNurseActor,
        slot: WardBedSlot,
      ) => {
        if (
          medicationRoomHandoff !== slot.room ||
          medicationHandoffNurseApproachSide === undefined
        ) {
          medicationRoomHandoff = slot.room;
          medicationHandoffNurseApproachSide =
            nurseApproachSideForHandoff(nurse, slot);
        }
        const robotSafe = medicationRobotHandoffSafePoint(slot),
          leftSafe = nurseDoorLeftSafePoint(slot),
          rightSafe = nurseDoorRightSafePoint(slot),
          robotSafeIndex = medicationRobot.route.findIndex(
            (point, index) =>
              index >= medicationRobot.waypoint &&
              (actorHorizontalDistance(point, leftSafe) < 0.1 ||
                actorHorizontalDistance(point, rightSafe) < 0.1),
          );
        if (robotSafeIndex >= 0)
          medicationRobot.route[robotSafeIndex] = robotSafe.clone();
      },
      clearMedicationRoomHandoff = () => {
        medicationRoomHandoff = undefined;
        medicationHandoffNurseApproachSide = undefined;
      },
      medicationRobotHasReachedHandoffSafePoint = (slot: WardBedSlot) =>
        medicationRobotHasClearedHandoffDoor(slot.room) &&
        actorHorizontalDistance(
          medicationRobot.group.position,
          medicationRobotHandoffSafePoint(slot),
        ) < 0.12,
      // During a same-room doorway handoff the exiting robot has passage
      // priority and is non-blocking. Collision returns only after the nurse
      // and attached cart have entered and the handoff flag is cleared.
      medicationRobotHandoffCollisionDisabled = () =>
        medicationRoomHandoff !== undefined &&
        medicationRobot.previousSlot?.room === medicationRoomHandoff,
      nurseAndCartHaveEnteredRoom = (
        nurse: WardNurseActor,
        slot: WardBedSlot,
      ) => {
        const nurseDepth = nurse.walker.group.position
            .clone()
            .sub(slot.doorCentre)
            .setY(0)
            .dot(slot.out),
          cartDepth = nurse.cart.position
            .clone()
            .sub(slot.doorCentre)
            .setY(0)
            .dot(slot.out);
        return nurseDepth > 0.52 && (!nurse.cartAttached || cartDepth > 0.12);
      },
      medicationRobotIsDepartingForHandoff = () =>
        medicationRoomHandoff !== undefined &&
        medicationRobot.previousSlot?.room === medicationRoomHandoff,
      beginMedicationRobotRoute = (
        patientIndex: number,
        route: THREE.Vector3[],
      ) => {
        const patient = inpatientPatients[patientIndex];
        if (!patient) return false;
        const departingFromHome =
          medicationRobot.mode === "home" ||
          medicationRobot.previousSlot === undefined;
        medicationQueue = medicationQueue.filter(
          (queuedIndex) => queuedIndex !== patientIndex,
        );
        medicationRobot.targetPatient = patientIndex;
        medicationRobot.route = route.map((point) => point.clone().setY(0));
        medicationRobot.waypoint = 0;
        medicationRobot.mode = "outbound";
        medicationRobot.timer = 0;
        medicationRobot.departureStaging = departingFromHome;
        medicationRobot.waitingForNurseRoom = undefined;
        medicationRobot.nurseRoomWaitPoint = undefined;
        medicationRobot.actorYieldSafetyPoint = undefined;
        return true;
      },
      tryStartNextMedicationTarget = () => {
        if (medicationRobot.targetPatient !== undefined) return false;
        const queuePosition = medicationQueue.findIndex((patientIndex) => {
          const patient = inpatientPatients[patientIndex];
          return (
            patient?.medicationReserved === true &&
            patient.state === "waitingMedication" &&
            !nurseOccupiesRoom(patient.slot.room) &&
            (medicationRoomHandoff === undefined ||
              patient.slot.room !== medicationRoomHandoff)
          );
        });
        if (queuePosition < 0) return false;
        const patientIndex = medicationQueue[queuePosition],
          patient = inpatientPatients[patientIndex],
          route =
            medicationRobot.mode === "home" || !medicationRobot.previousSlot
              ? medicationRobotRouteFromHome(patient.slot)
              : medicationRobotRouteBetweenBeds(
                  medicationRobot.previousSlot,
                  patient.slot,
                );
        return beginMedicationRobotRoute(patientIndex, route);
      },
      beginMedicationRobotReturn = () => {
        const fromSlot = medicationRobot.previousSlot;
        if (!fromSlot) return false;
        medicationRobot.targetPatient = undefined;
        medicationRobot.route = medicationRobotRouteHome(fromSlot);
        medicationRobot.waypoint = 0;
        medicationRobot.mode = "returning";
        medicationRobot.timer = 0;
        medicationRobot.departureStaging = false;
        medicationRobot.waitingForNurseRoom = undefined;
        medicationRobot.nurseRoomWaitPoint = undefined;
        medicationRobot.actorYieldSafetyPoint = undefined;
        return true;
      },
      finishMedicationRobotReturn = () => {
        medicationRobot.group.position.copy(medicationRobot.home);
        medicationRobot.group.rotation.y = Math.PI;
        medicationRobot.mode = "home";
        medicationRobot.route = [];
        medicationRobot.waypoint = 0;
        medicationRobot.targetPatient = undefined;
        medicationRobot.previousSlot = undefined;
        medicationRobot.timer = 0;
        medicationRobot.departureStaging = false;
        medicationRobot.waitingForNurseRoom = undefined;
        medicationRobot.nurseRoomWaitPoint = undefined;
        medicationRobot.actorYieldSafetyPoint = undefined;
        if (
          medicationTripClosed &&
          medicationQueue.length === 0 &&
          medicationTripCompleted >= medicationTripEnqueued
        ) {
          medicationTripOpen = false;
          medicationTripClosed = false;
          medicationTripEnqueued = 0;
          medicationTripCompleted = 0;
        }
      },
      updateMedicationPatient = (
        patient: InpatientActor,
        dt: number,
        t: number,
      ) => {
        if (patient.state === "waitingMedication") {
          applySupinePatientPose(patient, t, false);
          patient.walker.headRig.rotation.y = Math.sin(t * 1.15) * 0.018;
          return true;
        }
        if (patient.state === "medicationSittingUp") {
          patient.timer += dt;
          const duration = 1.35,
            progress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp(patient.timer / duration, 0, 1),
              0,
              1,
            );
          patient.walker.group.position.lerpVectors(
            patient.transitionFromPosition,
            patient.transitionToPosition,
            progress,
          );
          patient.walker.group.quaternion.slerpQuaternions(
            patient.transitionFromQuaternion,
            patient.transitionToQuaternion,
            progress,
          );
          patient.walker.group.scale.lerpVectors(
            patient.transitionFromScale,
            patient.transitionToScale,
            progress,
          );
          patient.walker.legs.forEach((leg, index) => {
            leg.position.set(
              THREE.MathUtils.lerp(
                index ? 0.13 : -0.13,
                index ? 0.14 : -0.14,
                progress,
              ),
              THREE.MathUtils.lerp(0.31, 0.69, progress),
              THREE.MathUtils.lerp(0, -0.3, progress),
            );
            leg.rotation.set(-Math.PI / 2 * progress, 0, 0);
          });
          patient.walker.arms[0].position.set(-0.36, 1.18, 0);
          patient.walker.arms[1].position.set(0.36, 1.18, 0);
          patient.walker.arms[0].rotation.z = 0;
          patient.walker.arms[1].rotation.z = 0;
          patient.walker.arms[0].rotation.x = 0.28 * progress;
          patient.walker.arms[1].rotation.x = 0.28 * progress;
          if (patient.timer >= duration) {
            patient.state = "takingMedication";
            patient.timer = 0;
            setWardWalkerSeatedLegs(patient.walker);
          }
          return true;
        }
        if (patient.state === "takingMedication") {
          patient.timer += dt;
          const seatPose = medicationPatientSeatPose(
            patient,
            medicationRobot.group.position,
          );
          patient.walker.group.position.copy(seatPose.position);
          patient.walker.group.quaternion.copy(seatPose.quaternion);
          patient.walker.group.scale.copy(seatPose.scale);
          setWardWalkerSeatedLegs(patient.walker);
          patient.walker.arms[0].position.set(-0.36, 1.18, 0);
          patient.walker.arms[1].position.set(0.36, 1.18, 0);
          if (patient.timer < 1.45) {
            // Both hands reach into the now-open cabinet. The pill appears in
            // the right hand only when the hand has reached the door opening.
            const reachProgress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp(patient.timer / 1.45, 0, 1),
              0,
              1,
            );
            patient.walker.arms[0].rotation.x = THREE.MathUtils.lerp(
              0.28,
              1.06,
              reachProgress,
            );
            patient.walker.arms[1].rotation.x = THREE.MathUtils.lerp(
              0.28,
              1.16,
              reachProgress,
            );
            patient.walker.arms[0].rotation.z = 0;
            patient.walker.arms[1].rotation.z = 0;
            patient.medicationPill.visible = patient.timer >= 1.18;
          } else if (patient.timer < 4.05) {
            // Hold the medicine clearly in view before taking it. This pause
            // makes the retrieval readable instead of flashing for one second.
            const displayProgress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp((patient.timer - 1.45) / 0.8, 0, 1),
              0,
              1,
            );
            patient.walker.arms[0].rotation.x = THREE.MathUtils.lerp(
              1.06,
              0.58,
              displayProgress,
            );
            patient.walker.arms[1].rotation.x =
              THREE.MathUtils.lerp(1.16, 0.72, displayProgress) +
              Math.sin(t * 2.2) * 0.025;
            patient.walker.arms[0].rotation.z = 0;
            patient.walker.arms[1].rotation.z = 0;
            patient.medicationPill.visible = true;
          } else if (patient.timer < 5.55) {
            const swallowProgress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp((patient.timer - 4.05) / 1.5, 0, 1),
              0,
              1,
            ),
              raiseProgress = THREE.MathUtils.smoothstep(
                THREE.MathUtils.clamp((patient.timer - 4.05) / 0.62, 0, 1),
                0,
                1,
              );
            patient.walker.arms[0].rotation.x = 0.42;
            patient.walker.arms[1].rotation.x = THREE.MathUtils.lerp(
              0.72,
              1.38,
              raiseProgress,
            );
            // Lift and angle the pill hand toward the centre of the face. A
            // shoulder-only rotation cannot raise this simple arm rig above
            // shoulder height, so the anchor rises with the swallowing pose.
            patient.walker.arms[1].position.y = THREE.MathUtils.lerp(
              1.18,
              1.55,
              raiseProgress,
            );
            patient.walker.arms[1].rotation.z = THREE.MathUtils.lerp(
              0,
              -0.58,
              raiseProgress,
            );
            patient.walker.arms[0].rotation.z = 0;
            patient.medicationPill.visible = swallowProgress < 0.72;
          } else {
            const resetProgress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp((patient.timer - 5.55) / 0.9, 0, 1),
              0,
              1,
            );
            patient.walker.arms[0].rotation.x = THREE.MathUtils.lerp(
              0.42,
              0.28,
              resetProgress,
            );
            patient.walker.arms[1].position.y = THREE.MathUtils.lerp(
              1.55,
              1.18,
              resetProgress,
            );
            patient.walker.arms[1].rotation.x = THREE.MathUtils.lerp(
              1.38,
              0.28,
              resetProgress,
            );
            patient.walker.arms[1].rotation.z = THREE.MathUtils.lerp(
              -0.58,
              0,
              resetProgress,
            );
            patient.walker.arms[0].rotation.z = 0;
            patient.medicationPill.visible = false;
          }
          patient.walker.headRig.rotation.x =
            0.04 + Math.sin(t * 2.4) * 0.025;
          if (patient.timer >= 6.55)
            startMedicationPatientSettling(patient);
          return true;
        }
        if (patient.state === "medicationSettling") {
          patient.timer += dt;
          const duration = 1.55,
            progress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp(patient.timer / duration, 0, 1),
              0,
              1,
            );
          patient.walker.group.position.lerpVectors(
            patient.transitionFromPosition,
            patient.transitionToPosition,
            progress,
          );
          patient.walker.group.quaternion.slerpQuaternions(
            patient.transitionFromQuaternion,
            patient.transitionToQuaternion,
            progress,
          );
          patient.walker.group.scale.lerpVectors(
            patient.transitionFromScale,
            patient.transitionToScale,
            progress,
          );
          patient.walker.legs.forEach((leg, index) => {
            leg.position.set(
              THREE.MathUtils.lerp(
                index ? 0.14 : -0.14,
                index ? 0.13 : -0.13,
                progress,
              ),
              THREE.MathUtils.lerp(0.69, 0.31, progress),
              THREE.MathUtils.lerp(-0.3, 0, progress),
            );
            leg.rotation.set(-Math.PI / 2 * (1 - progress), 0, 0);
          });
          patient.walker.arms.forEach((arm) =>
            arm.rotation.set(0.32 * (1 - progress), 0, 0),
          );
          patient.walker.arms.forEach((arm, index) =>
            arm.position.set(index ? 0.36 : -0.36, 1.18, 0),
          );
          if (patient.timer >= duration) completeMedicationPatient(patient);
          return true;
        }
        return false;
      },
      medicationRobotStatus = () => {
        if (medicationRobot.mode === "home")
          return medicationTripOpen
            ? "正在護理站等待下一位完成檢查的病患"
            : "正在護理站待機";
        if (medicationRobot.mode === "serving")
          return "正在病床旁協助病患服藥";
        if (medicationRobot.actorYieldSafetyPoint)
          return "正在倒退至安全點，禮讓走道上的護理師、醫療車與病患";
        if (
          medicationRobot.departureStaging &&
          actorHorizontalDistance(
            medicationRobot.group.position,
            medicationRobotStationExit,
          ) < 0.14 &&
          activeOutboundNurseDistance() < 5
        )
          return "已啟動並在護理站櫃檯邊等待與巡房護理師拉開五公尺";
        if (medicationRobot.waitingForNurseRoom !== undefined)
          return `正在病房 ${medicationRobot.waitingForNurseRoom} 門旁等待護理師與醫療車離房`;
        if (
          medicationRoomHandoff !== undefined &&
          medicationRobot.previousSlot?.room === medicationRoomHandoff
        ) {
          const handoffSlot = wardBedSlots.find(
            (slot) => slot.room === medicationRoomHandoff,
          );
          if (
            !handoffSlot ||
            !medicationRobotHasReachedHandoffSafePoint(handoffSlot)
          )
            return "正在離開病房並前往門外安全點，護理師於門外禮讓通行";
          return "已在門外另一側安全點等待護理師與醫療車進入病房";
        }
        if (medicationRobot.mode === "returning")
          return "正在返回護理站待機位置";
        return "正在前往剛完成檢查的病患病床";
      },
      updateMedicationRobot = (dt: number, t: number) => {
        const activeMedicationPatient =
            medicationRobot.targetPatient !== undefined
              ? inpatientPatients[medicationRobot.targetPatient]
              : undefined,
          doorShouldOpen =
            medicationRobot.mode === "serving" &&
            !!activeMedicationPatient?.medicationReserved &&
            ["medicationSittingUp", "takingMedication"].includes(
              activeMedicationPatient.state,
            );
        medicationRobot.doorOpenAmount = THREE.MathUtils.lerp(
          medicationRobot.doorOpenAmount,
          doorShouldOpen ? 1 : 0,
          1 - Math.exp(-dt * 5.2),
        );
        if (medicationRobot.doorOpenAmount < 0.002)
          medicationRobot.doorOpenAmount = 0;
        medicationRobotDoorPivot.rotation.y =
          Math.PI * 0.56 * medicationRobot.doorOpenAmount;

        if (
          medicationRobotScreen.material instanceof THREE.MeshStandardMaterial
        ) {
          const isActive = medicationRobot.mode !== "home";
          medicationRobotScreen.material.color.setHex(
            isActive ? 0xffd24a : 0x899497,
          );
          medicationRobotScreen.material.emissive.setHex(
            isActive ? 0xd99a00 : 0x343c3e,
          );
          medicationRobotScreen.material.emissiveIntensity = isActive
            ? 0.82 + Math.sin(t * 3.1) * 0.12
            : 0.16;
        }

        if (medicationRobot.mode === "home") {
          medicationRobot.group.position.copy(medicationRobot.home);
          medicationRobot.group.rotation.y = Math.PI;
          medicationRobot.waitingForNurseRoom = undefined;
          medicationRobot.nurseRoomWaitPoint = undefined;
          medicationRobot.actorYieldSafetyPoint = undefined;
          tryStartNextMedicationTarget();
          return;
        }
        if (medicationRobot.mode === "serving") {
          const patient =
            medicationRobot.targetPatient !== undefined
              ? inpatientPatients[medicationRobot.targetPatient]
              : undefined;
          if (patient?.medicationReserved) return;
          // Keep the robot parked until the dispensing door has fully closed.
          if (medicationRobot.doorOpenAmount > 0.025) return;
          if (patient) medicationRobot.previousSlot = patient.slot;
          medicationRobot.targetPatient = undefined;
          if (tryStartNextMedicationTarget()) return;
          if (medicationRobotIsDepartingForHandoff()) {
            beginMedicationRobotReturn();
            return;
          }
          // Never wait beside a bed for a future inspection to finish. Return
          // to the station after every completed serving when no patient is
          // immediately ready; a later queued patient can start from home.
          beginMedicationRobotReturn();
          return;
        }

        const inboundPatient =
            medicationRobot.mode === "outbound" &&
            medicationRobot.targetPatient !== undefined
              ? inpatientPatients[medicationRobot.targetPatient]
              : undefined,
          inboundSlot = inboundPatient?.slot,
          occupyingNurse = inboundSlot
            ? wardNurses.find(
                (nurse) =>
                  nurse.mode !== "station" &&
                  (pointIsInsideWardRoom(
                    nurse.walker.group.position,
                    inboundSlot.room,
                  ) ||
                    (nurse.cartAttached &&
                      pointIsInsideWardRoom(
                        nurse.cart.position,
                        inboundSlot.room,
                      ))),
              )
            : undefined,
          isApproachingOccupiedRoom =
            !!inboundSlot &&
            !!occupyingNurse &&
            !pointIsInsideWardRoom(
              medicationRobot.group.position,
              inboundSlot.room,
            ) &&
            actorHorizontalDistance(
              medicationRobot.group.position,
              inboundSlot.doorCentre,
            ) <= 3;
        if (
          isApproachingOccupiedRoom &&
          inboundSlot &&
          occupyingNurse &&
          medicationRobot.waitingForNurseRoom !== inboundSlot.room
        ) {
          const waitPoint = medicationRobotWaitPointForNurse(
            occupyingNurse,
            inboundSlot,
          );
          medicationRobot.route.splice(
            medicationRobot.waypoint,
            0,
            waitPoint,
          );
          medicationRobot.waitingForNurseRoom = inboundSlot.room;
          medicationRobot.nurseRoomWaitPoint = waitPoint.clone();
          medicationRobot.actorYieldSafetyPoint = undefined;
        } else if (
          medicationRobot.waitingForNurseRoom !== undefined &&
          !wardNurses.some(
            (nurse) =>
              nurse.mode !== "station" &&
              (pointIsInsideWardRoom(
                nurse.walker.group.position,
                medicationRobot.waitingForNurseRoom!,
              ) ||
                (nurse.cartAttached &&
                  pointIsInsideWardRoom(
                    nurse.cart.position,
                    medicationRobot.waitingForNurseRoom!,
                  ))),
          )
        ) {
          const pendingWaitPoint = medicationRobot.nurseRoomWaitPoint,
            pendingTarget = medicationRobot.route[medicationRobot.waypoint];
          if (
            pendingWaitPoint &&
            pendingTarget &&
            actorHorizontalDistance(pendingTarget, pendingWaitPoint) < 0.08
          )
            medicationRobot.route.splice(medicationRobot.waypoint, 1);
          medicationRobot.waitingForNurseRoom = undefined;
          medicationRobot.nurseRoomWaitPoint = undefined;
        }

        const target = medicationRobot.route[medicationRobot.waypoint];
        if (!target) {
          if (medicationRobot.mode === "returning") {
            finishMedicationRobotReturn();
            return;
          }
          const patient =
            medicationRobot.targetPatient !== undefined
              ? inpatientPatients[medicationRobot.targetPatient]
              : undefined;
          if (!patient || !patient.medicationReserved) {
            medicationRobot.targetPatient = undefined;
            medicationRobot.mode = "serving";
            return;
          }
          medicationRobot.group.position.copy(
            medicationRobotBedsidePoint(patient.slot),
          );
          medicationRobot.group.rotation.y = thirdFloorYaw(
            medicationRobot.group.position,
            patient.walker.group.position,
          );
          medicationRobot.mode = "serving";
          medicationRobot.timer = 0;
          if (typeof window !== "undefined")
            window.dispatchEvent(
              new CustomEvent("medify:clinic-call", {
                detail: {
                  floor: 3,
                  kind: "medication-arrival",
                  room: patient.slot.room,
                },
              }),
            );
          startMedicationPatientInteraction(patient);
          return;
        }

        const current = medicationRobot.group.position;
        if (medicationRobot.actorYieldSafetyPoint) {
          const safetyPoint = medicationRobot.actorYieldSafetyPoint,
            reverseDelta = safetyPoint.clone().sub(current).setY(0),
            reverseDistance = reverseDelta.length();
          if (reverseDistance > 0.07) {
            const reverseStep = Math.min(reverseDistance, dt * 0.4),
              proposed = current
                .clone()
                .addScaledVector(reverseDelta.normalize(), reverseStep)
                .setY(0);
            // Preserve the robot's forward heading while translating
            // backwards. It may retreat only through geometrically clear
            // space and only while increasing separation from nearby actors.
            if (
              medicationRobotActorSegmentIsBlocked(current, proposed, true)
            )
              return;
            current.copy(proposed);
            medicationRobot.wheelPhase -= reverseStep / 0.09;
            medicationRobotWheels.forEach((wheel) => {
              wheel.rotation.x = medicationRobot.wheelPhase;
              wheel.rotation.z = Math.PI / 2;
            });
            return;
          }
          current.copy(safetyPoint);
          const resumeDelta = target.clone().sub(current).setY(0),
            resumeDistance = resumeDelta.length();
          if (resumeDistance < 0.09) {
            medicationRobot.actorYieldSafetyPoint = undefined;
            return;
          }
          const probe = current
            .clone()
            .addScaledVector(
              resumeDelta.normalize(),
              Math.min(0.72, resumeDistance),
            )
            .setY(0);
          // Hold at the safety point until a useful stretch of the original
          // route is clear. This prevents the stop/reverse loop from becoming
          // a circular detour around the same person or cart.
          if (!medicationRobotActorSegmentIsBlocked(current, probe))
            medicationRobot.actorYieldSafetyPoint = undefined;
          return;
        }

        const delta = target.clone().sub(current).setY(0),
          distance = delta.length();
        if (distance < 0.09) {
          current.copy(target);
          const waitingAtOccupiedRoom =
            medicationRobot.waitingForNurseRoom !== undefined &&
            medicationRobot.nurseRoomWaitPoint !== undefined &&
            actorHorizontalDistance(
              target,
              medicationRobot.nurseRoomWaitPoint,
            ) < 0.08 &&
            wardNurses.some(
              (nurse) =>
                nurse.mode !== "station" &&
                (pointIsInsideWardRoom(
                  nurse.walker.group.position,
                  medicationRobot.waitingForNurseRoom!,
                ) ||
                  (nurse.cartAttached &&
                    pointIsInsideWardRoom(
                      nurse.cart.position,
                      medicationRobot.waitingForNurseRoom!,
                    ))),
            );
          if (waitingAtOccupiedRoom) {
            const waitSlot = wardBedSlots.find(
              (slot) => slot.room === medicationRobot.waitingForNurseRoom,
            );
            if (waitSlot)
              medicationRobot.group.rotation.y = thirdFloorYaw(
                current,
                waitSlot.doorCentre,
              );
            return;
          }
          const handoffSlot =
              medicationRoomHandoff !== undefined
                ? wardBedSlots.find(
                    (slot) => slot.room === medicationRoomHandoff,
                  )
                : undefined,
            isHandoffSafeTarget =
              !!handoffSlot &&
              medicationRobot.previousSlot?.room === handoffSlot.room &&
              actorHorizontalDistance(
                target,
                medicationRobotHandoffSafePoint(handoffSlot),
              ) < 0.1 &&
              medicationRobotHasClearedHandoffDoor(handoffSlot.room);
          // Doorway passage never pauses. The robot stops only after it has
          // fully exited and reached the side opposite the nurse's approach.
          // Keeping this waypoint active makes the wait stable—no rotation or
          // route re-planning—until the nurse and cart are inside.
          if (isHandoffSafeTarget) return;
          if (
            medicationRobot.departureStaging &&
            actorHorizontalDistance(target, medicationRobotStationExit) < 0.1
          ) {
            // Start immediately after the first inspection and travel as far
            // as the counter edge. Enter the public corridor once the outbound
            // nurse and cart are at least five metres away.
            if (activeOutboundNurseDistance() < 5) return;
            medicationRobot.departureStaging = false;
          }
          medicationRobot.waypoint++;
          return;
        }
        const direction = delta.normalize(),
          targetYaw = thirdFloorYaw(current, current.clone().add(direction)),
          yawDelta = Math.atan2(
            Math.sin(targetYaw - medicationRobot.group.rotation.y),
            Math.cos(targetYaw - medicationRobot.group.rotation.y),
          );
        medicationRobot.group.rotation.y +=
          THREE.MathUtils.clamp(yawDelta, -dt * 3.5, dt * 3.5);
        if (Math.abs(yawDelta) > 0.32) return;
        const step = Math.min(distance, dt * 0.56),
          proposed = current.clone().addScaledVector(direction, step).setY(0);
        // This is a hard geometry boundary, independent of character
        // collision. A route or recovery point may never move the cabinet
        // through courtyard glass, a ward wall or the nursing counter.
        if (!medicationRobotTransitionIsClear(current, proposed)) return;
        if (medicationRobotActorStepIsBlocked(current, proposed)) {
          const safetyPoint = findMedicationRobotSafetyPoint(
            current,
            direction,
          );
          if (safetyPoint)
            medicationRobot.actorYieldSafetyPoint = safetyPoint;
          return;
        }
        current.copy(proposed);
        medicationRobot.wheelPhase += step / 0.09;
        medicationRobotWheels.forEach((wheel) => {
          wheel.rotation.x = medicationRobot.wheelPhase;
          wheel.rotation.z = Math.PI / 2;
        });
        wardBedSlots.forEach((slot) => {
          if (
            actorHorizontalDistance(current, slot.doorCentre) < 1.9
          )
            wardSwingDoors[slot.doorIndex].openTarget = 1;
        });
      },
      moveWardNurse = (nurse: WardNurseActor, dt: number, t: number) => {
        const target = nurse.route[nurse.waypoint];
        if (!target) {
          if (nurse.mode === "outbound" && inspectionPatient) {
            // The final bedside segment is travelled in reverse. Once the
            // nurse reaches the stop point, leave the cart parked toward the
            // room aisle and rotate only the nurse to face the patient.
            nurse.cartParked = true;
            const bedsidePoint = inspectionBedsidePoint(
                inspectionPatient.slot,
              ),
              cartParkPoint = inspectionCartParkPoint(
                inspectionPatient.slot,
              ),
              patientYaw = thirdFloorYaw(
                bedsidePoint,
                inspectionPatient.walker.group.position,
              );
            // Snap away sub-frame interpolation residue before the checking
            // turn. The cart then remains at the bed-derived parking point and
            // can neither orbit into nor overlap the patient.
            nurse.walker.group.position.copy(bedsidePoint);
            nurse.cart.position.copy(cartParkPoint);
            nurse.cart.rotation.y = thirdFloorYaw(
              bedsidePoint,
              cartParkPoint,
            );
            if (inspectionPatient.state === "bedEat") {
              // The nurse has now arrived. Stop dining at this moment, remove
              // the tray and wait beside the parked cart while the patient
              // reclines into the locked supine inspection pose.
              inspectionPatient.tray.visible = false;
              startPatientSettling(inspectionPatient, "waitingCheck");
              nurse.mode = "waitingNext";
              nurse.timer = 0;
              inspectionPhase = "awaitBedsideSupine";
              return;
            }
            if (inspectionPatient.state !== "waitingCheck") {
              nurse.mode = "waitingNext";
              nurse.timer = 0;
              inspectionPhase = "awaitBedsideSupine";
              return;
            }
            if (!turnWardWalkerToward(nurse.walker, patientYaw, dt)) return;
            nurse.walker.group.rotation.set(0, patientYaw, 0);
            nurse.mode = "checking";
            nurse.timer = 0;
            inspectionCheckDuration =
              6 +
              ((inspectionPatient.walker.group.userData.inpatientIndex +
                inspectionTripCompleted) %
                5);
            inspectionPhase = "checking";
            inspectionPatient.state = "beingChecked";
          } else if (nurse.mode === "returning") finishNurseReturn(nurse);
          return;
        }
        const handoffSlot =
            nurse.mode === "outbound" && inspectionPatient
              ? inspectionPatient.slot
              : undefined,
          nurseIsInsideHandoffRoom =
            !!handoffSlot &&
            nurseAndCartHaveEnteredRoom(nurse, handoffSlot),
          nurseDistanceToTargetDoor = handoffSlot
            ? Math.min(
                actorHorizontalDistance(
                  nurse.walker.group.position,
                  handoffSlot.doorCentre,
                ),
                nurse.cartAttached
                  ? actorHorizontalDistance(
                      nurse.cart.position,
                      handoffSlot.doorCentre,
                    )
                  : Number.POSITIVE_INFINITY,
              )
            : Number.POSITIVE_INFINITY,
          robotIsInsideTargetRoom =
            !!handoffSlot &&
            pointIsInsideWardRoom(
              medicationRobot.group.position,
              handoffSlot.room,
            ),
          robotClaimsHandoffRoom =
            !!handoffSlot &&
            (medicationRoomHandoff === handoffSlot.room ||
              (nurseDistanceToTargetDoor <= 3 &&
                robotIsInsideTargetRoom));
        if (
          handoffSlot &&
          medicationRoomHandoff === handoffSlot.room &&
          nurseIsInsideHandoffRoom
        )
          clearMedicationRoomHandoff();
        if (
          handoffSlot &&
          !nurseIsInsideHandoffRoom &&
          robotClaimsHandoffRoom
        ) {
          configureMedicationRoomHandoff(nurse, handoffSlot);
          const nurseSafe = nurseMedicationHandoffSafePoint(handoffSlot),
            regularRouteSafe = nurseDoorRightSafePoint(handoffSlot),
            atNurseSafe =
              actorHorizontalDistance(
                nurse.walker.group.position,
                nurseSafe,
              ) < 0.12,
            upcomingRegularSafeIndex = nurse.route.findIndex(
              (point, index) =>
                index >= nurse.waypoint &&
                (actorHorizontalDistance(point, regularRouteSafe) < 0.08 ||
                  actorHorizontalDistance(point, nurseSafe) < 0.08),
            ),
            upcomingOutsideIndex = nurse.route.findIndex(
              (point, index) =>
                index >= nurse.waypoint &&
                actorHorizontalDistance(point, roomOutsidePoint(handoffSlot)) <
                  0.08,
            );
          if (!atNurseSafe && upcomingRegularSafeIndex >= 0) {
            // Keep the nurse on the side it is already approaching from. The
            // robot's route is rewritten to the opposite safe point, so neither
            // wheeled actor crosses the other's doorway lane.
            if (
              actorHorizontalDistance(
                nurse.route[upcomingRegularSafeIndex],
                nurseSafe,
              ) >= 0.08
            ) {
              nurse.route[upcomingRegularSafeIndex] = nurseSafe.clone();
              if (upcomingRegularSafeIndex === nurse.waypoint) return;
            }
          } else if (!atNurseSafe && upcomingOutsideIndex >= 0) {
            nurse.route.splice(upcomingOutsideIndex, 0, nurseSafe.clone());
            if (nurse.cartAttachWaypoint >= upcomingOutsideIndex)
              nurse.cartAttachWaypoint++;
            if (nurse.reverseWaypoint >= upcomingOutsideIndex)
              nurse.reverseWaypoint++;
            if (upcomingOutsideIndex === nurse.waypoint) return;
          }
          if (
            atNurseSafe &&
            !medicationRobotHasReachedHandoffSafePoint(handoffSlot)
          ) {
            // This is an intentional wait, not a navigation turn. Lock the
            // nurse to the cart-facing yaw so repeated route updates cannot
            // make either actor rotate in place while the robot clears.
            const waitYaw = thirdFloorYaw(
              nurse.walker.group.position,
              nurse.cart.position,
            );
            nurse.walker.group.rotation.set(0, waitYaw, 0);
            nurse.cart.rotation.y = waitYaw;
            nurse.walker.legs.forEach((leg) => leg.rotation.set(0, 0, 0));
            placeWardNursePalmsOnCart(nurse);
            nurse.motionStallTime = 0;
            nurse.motionWatchPosition.copy(nurse.walker.group.position);
            nurse.blockedTime = 0;
            return;
          }
        }
        const current = nurse.walker.group.position,
          delta = target.clone().sub(current).setY(0),
          distance = delta.length(),
          wardDoorWaypoint = wardDoorCentres.some(
            (centre) => actorHorizontalDistance(target, centre) < 0.14,
          ),
          returnDropWaypoint =
            nurse.mode === "returning" &&
            actorHorizontalDistance(target, nurseCartReturnDropPoint) < 0.08,
          glassDetourUntilWaypoint = Number(
            nurse.walker.group.userData.glassDetourUntilWaypoint ?? -1,
          ),
          glassDetourWaypoint =
            glassDetourUntilWaypoint >= 0 &&
            nurse.waypoint <= glassDetourUntilWaypoint,
          exactWaypoint =
            nurse.waypoint === nurse.cartAttachWaypoint ||
            nurse.waypoint === nurse.reverseWaypoint ||
            wardDoorWaypoint ||
            returnDropWaypoint ||
            glassDetourWaypoint,
          waypointThreshold = exactWaypoint ? 0.1 : 0.22;
        if (distance < waypointThreshold) {
          if (exactWaypoint) {
            current.x = target.x;
            current.z = target.z;
          }
          if (
            nurse.waypoint === nurse.cartAttachWaypoint &&
            nurse.mode === "outbound"
          ) {
            const nextTarget = nurse.route[nurse.waypoint + 1],
              pickupYaw = nextTarget
                ? thirdFloorYaw(current, nextTarget)
                : nurse.walker.group.rotation.y;
            setWardWalkerStanding(nurse.walker, pickupYaw);
            nurse.cart.position.copy(nurse.cartHome);
            nurse.cart.rotation.y = pickupYaw;
            nurse.cartAttached = true;
            nurse.cartParked = false;
            nurse.cartAttachWaypoint = -1;
          }
          if (
            nurse.mode === "returning" &&
            nurse.cartAttached &&
            actorHorizontalDistance(target, nurseCartReturnDropPoint) < 0.08
          ) {
            nurse.cart.position.copy(nurse.cartHome);
            nurse.cart.rotation.y = Math.PI / 2;
            nurse.cartAttached = false;
          }
          if (
            glassDetourWaypoint &&
            nurse.waypoint >= glassDetourUntilWaypoint
          )
            nurse.walker.group.userData.glassDetourUntilWaypoint = undefined;
          nurse.waypoint++;
          return;
        }
        const direction = exactWaypoint
            ? delta.normalize()
            : thirdFloorRouteDirection(
                current,
                nurse.route,
                nurse.waypoint,
                wardDoorWaypoint ? 0.28 : 0.68,
              ),
          step = Math.min(distance, wardNurseWalkSpeed * dt),
          proposed = current.clone().addScaledVector(direction, step);
        proposed.y = 0;
        const movingBackward = nurse.waypoint === nurse.reverseWaypoint,
          steeringPoint = current.clone().add(direction),
          targetYaw = movingBackward
            ? thirdFloorYaw(steeringPoint, current)
            : thirdFloorYaw(current, steeringPoint),
          nurseKey = `n:${nurse.index}`,
          facingReady = turnWardWalkerToward(nurse.walker, targetYaw, dt),
          facingDirection = new THREE.Vector3(
            -Math.sin(nurse.walker.group.rotation.y),
            0,
            -Math.cos(nurse.walker.group.rotation.y),
          ),
          targetFacingDirection = new THREE.Vector3(
            -Math.sin(targetYaw),
            0,
            -Math.cos(targetYaw),
          ),
          proposedCart = proposed
            .clone()
            .addScaledVector(targetFacingDirection, wardNurseCartDistance)
            .setY(0),
          turningCartTarget = current
            .clone()
            .addScaledVector(facingDirection, wardNurseCartDistance)
            .setY(0);
        // Keep the cart centred in front even while the nurse is turning in
        // place, rather than letting it drift beside or behind the body.
        if (nurse.cartAttached && !nurse.cartParked) {
          if (!isNurseClearOfCourtyardGlass(turningCartTarget, 0.8)) {
            nurse.walker.group.userData.blockedByCourtyardGlass = true;
            nurse.blockedTime += dt;
            if (
              nurse.blockedTime >= 0.55 &&
              insertNurseCourtyardGlassDetour(nurse)
            )
              nurse.motionStallTime = 0;
            return;
          }
          nurse.cart.position.lerp(
            turningCartTarget,
            1 - Math.exp(-dt * 14),
          );
          nurse.cart.rotation.y = nurse.walker.group.rotation.y;
          placeWardNursePalmsOnCart(nurse);
        }
        if (!facingReady) return;
        nurse.walker.group.rotation.set(0, targetYaw, 0);
        if (
          !isNurseClearOfCourtyardGlass(proposed, 0.72) ||
          (nurse.cartAttached &&
            !isNurseClearOfCourtyardGlass(proposedCart, 0.8))
        ) {
          nurse.walker.group.userData.blockedByCourtyardGlass = true;
          nurse.blockedTime += dt;
          if (
            nurse.blockedTime >= 0.55 &&
            insertNurseCourtyardGlassDetour(nurse)
          )
            nurse.motionStallTime = 0;
          return;
        }
        if (
          !canUseThirdFloorDoors(
            nurseKey,
            current,
            proposed,
            false,
            nurse.cartAttached ? nurse.cart.position : undefined,
            nurse.cartAttached ? proposedCart : undefined,
          )
        ) {
          nurse.blockedTime += dt;
          return;
        }
        // The compact route beside a bed has already been surveyed against
        // furniture geometry. Oversized proxy circles around supine patients
        // and their parked IV stands in that same room used to overlap this
        // valid lane forever, so the nurse could never reach or leave the
        // fixed bedside point. Ignore only those static same-room proxies;
        // mobile patients and every other actor remain hard obstacles.
        const surveyedBedsideRoom =
            nurse.mode === "outbound" && inspectionPatient
              ? inspectionPatient.slot.room
              : nurse.mode === "returning" && inspectionPreviousSlot
                ? inspectionPreviousSlot.room
                : undefined,
          isSurveyedBedsideOccupant = (patient: InpatientActor) =>
            surveyedBedsideRoom !== undefined &&
            patient.slot.room === surveyedBedsideRoom &&
            [
              "bedRest",
              "bedEat",
              "waitingCheck",
              "beingChecked",
              "waitingMedication",
              "medicationSittingUp",
              "takingMedication",
              "medicationSettling",
            ].includes(patient.state),
          patientIsWalkingInPublicCorridor = (patient: InpatientActor) =>
            patient.state === "walking" &&
            patient.walker.group.position
              .clone()
              .sub(patient.slot.doorCentre)
              .dot(patient.slot.out) < -0.52,
          blockedByActor = inpatientPatients.some((patient) => {
            const patientIsInBed = [
              "bedRest",
              "bedEat",
              "waitingCheck",
              "beingChecked",
              "waitingMedication",
              "medicationSittingUp",
              "takingMedication",
              "medicationSettling",
            ].includes(patient.state),
              nurseClearance = patientIsInBed ? 0.64 : 0.78,
              cartClearance = patientIsInBed ? 0.78 : 0.86;
            if (
              isSurveyedBedsideOccupant(patient) ||
              patientIsWalkingInPublicCorridor(patient)
            )
              return false;
            return (
              actorHorizontalDistance(
                proposed,
                patient.walker.group.position,
              ) < nurseClearance ||
              (nurse.cartAttached &&
                actorHorizontalDistance(
                  proposedCart,
                  patient.walker.group.position,
                ) < cartClearance)
            );
          }) ||
          inpatientPatients.some(
            (patient) =>
              !isSurveyedBedsideOccupant(patient) &&
              !patientIsWalkingInPublicCorridor(patient) &&
              (actorHorizontalDistance(
                proposed,
                patient.slot.ivStand.position,
              ) < 0.7 ||
                (nurse.cartAttached &&
                  actorHorizontalDistance(
                    proposedCart,
                    patient.slot.ivStand.position,
                  ) < 0.82)),
          );
        const blockedByNurseOrCart =
          wardNurses.some(
            (other) =>
              other !== nurse &&
              (actorHorizontalDistance(
                proposed,
                other.walker.group.position,
              ) < 0.78 ||
                (nurse.cartAttached &&
                  actorHorizontalDistance(
                    proposedCart,
                    other.walker.group.position,
                  ) < 0.86)),
          ) ||
          thirdFloorMedicalCarts.some(
            (cart) =>
              cart !== nurse.cart &&
              (actorHorizontalDistance(proposed, cart.position) < 0.82 ||
                (nurse.cartAttached &&
                  actorHorizontalDistance(proposedCart, cart.position) <
                    0.9)),
          ) ||
          (medicationRobot.mode !== "home" &&
            !medicationRobotHandoffCollisionDisabled() &&
            !medicationRobotIsInPublicCorridor() &&
            (actorHorizontalDistance(
              proposed,
              medicationRobot.group.position,
            ) < 0.86 ||
              (nurse.cartAttached &&
                actorHorizontalDistance(
                  proposedCart,
                  medicationRobot.group.position,
                ) < 0.96)));
        if (
          blockedByNurseOrCart ||
          (blockedByActor && nurse.navigationOverride <= 0)
        ) {
          // The cart follows surveyed corridor and bedside lanes. Waiting for
          // the transient actor to clear is safer than injecting an arbitrary
          // side-step that can make the cart overshoot, spin, or enter glass.
          nurse.blockedTime = Math.min(nurse.blockedTime + dt, 3);
          return;
        }
        nurse.blockedTime = 0;
        nurse.walker.group.userData.blockedByCourtyardGlass = false;
        current.copy(proposed);
        nurse.cartParked = false;
        const yaw = targetYaw,
          modelForward = new THREE.Vector3(
            -Math.sin(yaw),
            0,
            -Math.cos(yaw),
          );
        nurse.walker.group.rotation.set(0, yaw, 0);
        const gait =
          Math.sin(t * 7.6 + nurse.index) * (movingBackward ? -0.72 : 1);
        nurse.walker.legs[0].rotation.x = gait * 0.44;
        nurse.walker.legs[1].rotation.x = -gait * 0.44;
        if (nurse.cartAttached) {
          const cartTarget = current
            .clone()
            .addScaledVector(modelForward, wardNurseCartDistance)
            .setY(0);
          nurse.cart.position.lerp(cartTarget, 1 - Math.exp(-dt * 14));
          nurse.cart.rotation.y = yaw;
          placeWardNursePalmsOnCart(nurse);
        } else {
          nurse.walker.arms[0].rotation.set(-gait * 0.34, 0, 0.06);
          nurse.walker.arms[1].rotation.set(gait * 0.34, 0, -0.06);
        }
        if (inspectionPatient) {
          const doorDistance = actorHorizontalDistance(
            current,
            inspectionPatient.slot.doorCentre,
          );
          if (doorDistance < 2.05)
            wardSwingDoors[inspectionPatient.slot.doorIndex].openTarget = 1;
        }
      },
      insertNurseCourtyardGlassDetour = (nurse: WardNurseActor) => {
        const current = nurse.walker.group.position,
          target = nurse.route[nurse.waypoint];
        if (!target) return false;
        const detour: THREE.Vector3[] = [],
          addDistinct = (point: THREE.Vector3) => {
            const previous = detour[detour.length - 1] ?? current;
            if (actorHorizontalDistance(previous, point) > 0.16)
              detour.push(point.setY(0));
          };

        // A ward nurse never has a legitimate destination in the courtyard.
        // Recovery therefore returns to the canonical north corridor instead
        // of following the glazing exterior, which could itself lead into the
        // surrounding building envelope. First move straight north, then
        // travel horizontally on the protected cart lane before rejoining the
        // existing ward/station route.
        const safeCurrentX = THREE.MathUtils.clamp(current.x, -5.18, 5.18),
          safeTargetX = THREE.MathUtils.clamp(target.x, -5.18, 5.18);
        addDistinct(new THREE.Vector3(current.x, 0, wardNurseCorridorZ));
        if (Math.abs(current.x - safeCurrentX) > 0.08)
          addDistinct(
            new THREE.Vector3(safeCurrentX, 0, wardNurseCorridorZ),
          );
        addDistinct(new THREE.Vector3(safeTargetX, 0, wardNurseCorridorZ));
        if (detour.length === 0) return false;
        nurse.route.splice(nurse.waypoint, 0, ...detour);
        if (nurse.cartAttachWaypoint >= nurse.waypoint)
          nurse.cartAttachWaypoint += detour.length;
        if (nurse.reverseWaypoint >= nurse.waypoint)
          nurse.reverseWaypoint += detour.length;
        // Detour points are exact, sequential obligations. Route smoothing is
        // disabled through the final inserted point so neither nurse nor cart
        // can cut the corner back toward the glazing.
        nurse.walker.group.userData.glassDetourUntilWaypoint =
          nurse.waypoint + detour.length - 1;
        nurse.walker.group.userData.blockedByCourtyardGlass = false;
        nurse.blockedTime = 0;
        nurse.motionWatchPosition.copy(current);
        return true;
      };

    const updateThirdFloorCare = (dt: number, t: number) => {
      if (!thirdFloorCareActivated) {
        // Third-floor care is constructed together with the complete hospital,
        // but its opening activity must begin only when the visitor actually
        // reaches 3F and this updater runs for the first time.
        initializeOpeningCourtyardPatient();
        thirdFloorCareActivated = true;
      }
      releaseThirdFloorDoorReservations();
      patientDepartureCooldown = Math.max(0, patientDepartureCooldown - dt);
      inpatientPatients.forEach((actor) => {
        actor.doorPassOverride = Math.max(0, actor.doorPassOverride - dt);
        actor.postInspectionCooldown = Math.max(
          0,
          actor.postInspectionCooldown - dt,
        );
        const shouldProgress = ["rising", "walking"].includes(
            actor.state,
          ),
          intentionallyQueued =
            actor.walker.group.userData.waitingForCourtyardDoor === true;
        if (shouldProgress && !courtyardSeatTaskIsValid(actor)) {
          continueAfterCancelledConversation(actor);
          return;
        }
        if (shouldProgress) {
          if (intentionallyQueued) {
            actor.motionStallTime = 0;
            actor.motionWatchPosition.copy(actor.walker.group.position);
          } else if (
            actorHorizontalDistance(
              actor.walker.group.position,
              actor.motionWatchPosition,
            ) > 0.12
          ) {
            actor.motionWatchPosition.copy(actor.walker.group.position);
            actor.motionStallTime = 0;
          } else actor.motionStallTime += dt;
          const stallLimit = actor.state === "walking" ? 1.8 : 8;
          if (actor.motionStallTime > stallLimit) {
            recoverStalledPatient(actor);
            return;
          }
        } else {
          actor.motionStallTime = 0;
          actor.motionWatchPosition.copy(actor.walker.group.position);
        }
        if (updateMedicationPatient(actor, dt, t)) return;
        if (actor.state === "rising" || actor.state === "settling") {
          actor.timer += dt;
          const duration = actor.state === "settling" ? 1.82 : 1.34,
            progress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp(actor.timer / duration, 0, 1),
              0,
              1,
            );
          if (actor.state === "settling") {
            const seatPose = wardBedSeatPose(actor.slot),
              seatShare = actor.transitionStartsSeated ? 0 : 0.42;
            if (!actor.transitionStartsSeated && progress < seatShare) {
              const seatProgress = THREE.MathUtils.smoothstep(
                progress / seatShare,
                0,
                1,
              );
              actor.walker.group.position.lerpVectors(
                actor.transitionFromPosition,
                seatPose.position,
                seatProgress,
              );
              actor.walker.group.quaternion.slerpQuaternions(
                actor.transitionFromQuaternion,
                seatPose.quaternion,
                seatProgress,
              );
              actor.walker.group.scale.lerpVectors(
                actor.transitionFromScale,
                seatPose.scale,
                seatProgress,
              );
              actor.walker.legs.forEach((leg, index) => {
                leg.position.set(
                  THREE.MathUtils.lerp(
                    index ? 0.13 : -0.13,
                    index ? 0.14 : -0.14,
                    seatProgress,
                  ),
                  THREE.MathUtils.lerp(0.31, 0.69, seatProgress),
                  THREE.MathUtils.lerp(0, -0.3, seatProgress),
                );
                leg.rotation.set(-Math.PI / 2 * seatProgress, 0, 0);
              });
            } else {
              const reclineProgress = THREE.MathUtils.smoothstep(
                actor.transitionStartsSeated
                  ? progress
                  : (progress - seatShare) / (1 - seatShare),
                0,
                1,
              );
              actor.walker.group.position.lerpVectors(
                actor.transitionStartsSeated
                  ? actor.transitionFromPosition
                  : seatPose.position,
                actor.transitionToPosition,
                reclineProgress,
              );
              actor.walker.group.quaternion.slerpQuaternions(
                actor.transitionStartsSeated
                  ? actor.transitionFromQuaternion
                  : seatPose.quaternion,
                actor.transitionToQuaternion,
                reclineProgress,
              );
              actor.walker.group.scale.lerpVectors(
                actor.transitionStartsSeated
                  ? actor.transitionFromScale
                  : seatPose.scale,
                actor.transitionToScale,
                reclineProgress,
              );
              actor.walker.legs.forEach((leg, index) => {
                leg.position.set(
                  THREE.MathUtils.lerp(
                    index ? 0.14 : -0.14,
                    index ? 0.13 : -0.13,
                    reclineProgress,
                  ),
                  THREE.MathUtils.lerp(0.69, 0.31, reclineProgress),
                  THREE.MathUtils.lerp(-0.3, 0, reclineProgress),
                );
                // Counter the body's backward roll so both legs stay level
                // while the torso reclines onto the mattress.
                leg.rotation.set(
                  -Math.PI / 2 * (1 - reclineProgress),
                  0,
                  0,
                );
              });
            }
          } else {
            actor.walker.group.position.lerpVectors(
              actor.transitionFromPosition,
              actor.transitionToPosition,
              progress,
            );
            actor.walker.group.quaternion.slerpQuaternions(
              actor.transitionFromQuaternion,
              actor.transitionToQuaternion,
              progress,
            );
            actor.walker.group.scale.lerpVectors(
              actor.transitionFromScale,
              actor.transitionToScale,
              progress,
            );
            setWardWalkerLyingLimbs(actor.walker);
          }
          // Returning patients have already pushed the stand to its north-wall
          // home. Keep it fixed while they sit and recline; equipment must not
          // slide independently during the bed transition.
          actor.slot.ivStand.position.copy(actor.ivParkPosition);
          actor.walker.arms[0].rotation.set(0.72, 0, 0.28);
          if (actor.timer >= duration) {
            actor.timer = 0;
            if (actor.state === "rising") {
              setWardWalkerStanding(
                actor.walker,
                thirdFloorPatientYaw(
                  actor.transitionToPosition,
                  actor.route[Math.min(actor.waypoint, actor.route.length - 1)],
                ),
              );
              actor.walker.group.position.copy(actor.transitionToPosition);
              actor.state = "walking";
            } else {
              actor.walker.group.position.copy(actor.transitionToPosition);
              actor.walker.group.quaternion.copy(actor.transitionToQuaternion);
              actor.walker.group.scale.copy(actor.transitionToScale);
              setWardWalkerLyingLimbs(actor.walker);
              actor.state =
                actor.arrival === "waitingCheck" ? "waitingCheck" : "bedRest";
              actor.walker.group.userData.lastCourtyardConversationPartner =
                undefined;
              actor.timer =
                actor.state === "bedRest" ? 18 + Math.random() * 12 : 0;
            }
          }
          return;
        }
        if (actor.state === "parkingIv") {
          actor.timer += dt;
          const pushDuration = 1.45,
            releaseDuration = 1.05,
            totalDuration = pushDuration + releaseDuration,
            pushProgress = THREE.MathUtils.smoothstep(
              THREE.MathUtils.clamp(actor.timer / pushDuration, 0, 1),
              0,
              1,
            ),
            parkingYaw = new THREE.Euler().setFromQuaternion(
              actor.transitionToQuaternion,
              "YXZ",
            ).y;
          actor.walker.group.quaternion.slerpQuaternions(
            actor.transitionFromQuaternion,
            actor.transitionToQuaternion,
            pushProgress,
          );
          actor.walker.arms[0].rotation.set(0.78, 0, 0.3);
          if (actor.timer <= pushDuration) {
            actor.walker.group.position.lerpVectors(
              actor.transitionFromPosition,
              actor.transitionToPosition,
              pushProgress,
            );
            // The stand is derived from the live palm every frame, so this is
            // a visible push rather than an autonomous glide to the wall.
            actor.slot.ivStand.position.copy(inpatientIvPalmFloorPoint(actor));
            actor.slot.ivStand.rotation.y = parkingYaw;
          } else {
            const releaseProgress = THREE.MathUtils.smoothstep(
                THREE.MathUtils.clamp(
                  (actor.timer - pushDuration) / releaseDuration,
                  0,
                  1,
                ),
                0,
                1,
              ),
              bedReturnPoint = bedExitPoint(actor.slot);
            actor.slot.ivStand.position.copy(actor.ivParkPosition);
            actor.walker.group.position.lerpVectors(
              actor.transitionToPosition,
              bedReturnPoint,
              releaseProgress,
            );
          }
          const gait = Math.sin(
            t * 7.4 + actor.walker.group.userData.inpatientIndex,
          );
          actor.walker.legs[0].rotation.x = gait * 0.34;
          actor.walker.legs[1].rotation.x = -gait * 0.34;
          actor.walker.arms[1].rotation.set(-gait * 0.22, 0, -0.08);
          if (actor.timer >= totalDuration) {
            actor.slot.ivStand.position.copy(actor.ivParkPosition);
            actor.walker.group.position.copy(bedExitPoint(actor.slot));
            startPatientSettling(
              actor,
              actor.arrival === "waitingCheck" ? "waitingCheck" : "bedRest",
            );
          }
          return;
        }
        actor.timer = Math.max(0, actor.timer - dt);
        if (actor.state === "walking") {
          if (invitePassingPatientToNeighbourSeat(actor, t)) return;
          moveInpatient(actor, dt, t);
          return;
        }
        if (actor.state === "bedRest") {
          applySupinePatientPose(actor, t, true);
          actor.walker.headRig.rotation.y = Math.sin(t * 0.9 + actor.slot.index) * 0.025;
          actor.walker.arms[0].rotation.x = Math.sin(t * 1.25) * 0.025;
          if (actor.timer <= 0) schedulePatientTask(actor);
          return;
        }
        if (actor.state === "bedEat") {
          actor.walker.arms[0].rotation.x = 0.82 + Math.sin(t * 3.3) * 0.18;
          actor.walker.arms[1].rotation.x = 0.58 + Math.sin(t * 2.7) * 0.12;
          actor.walker.headRig.rotation.x = 0.08 + Math.sin(t * 2.2) * 0.035;
          if (actor.timer <= 0 && !actor.inspectionReserved) {
            actor.tray.visible = false;
            startPatientSettling(actor, "bedRest");
          }
          return;
        }
        if (actor.state === "courtyardSit") {
          if (
            actor.assignedCourtyardSeat === undefined ||
            actorHorizontalDistance(
              actor.walker.group.position,
              courtyardStoneSeats[actor.assignedCourtyardSeat],
            ) > 0.36
          ) {
            beginPatientHomeRoute(actor, "bedRest");
            return;
          }
          setWardWalkerSeatedLegs(actor.walker);
          actor.walker.arms[0].rotation.x = 0.42;
          actor.walker.arms[1].rotation.x = 0.36;
          actor.walker.headRig.rotation.y = Math.sin(t * 1.6) * 0.08;
          if (actor.timer <= 0) beginPatientHomeRoute(actor, "bedRest");
          return;
        }
        if (actor.state === "socialTalk") {
          const partner =
            actor.partner !== undefined
              ? inpatientPatients[actor.partner]
              : undefined;
          if (
            !partner ||
            partner.state !== "socialTalk" ||
            partner.partner !==
              actor.walker.group.userData.inpatientIndex
          ) {
            if (
              partner &&
              partner.partner === actor.walker.group.userData.inpatientIndex
            )
              partner.partner = undefined;
            actor.partner = undefined;
            beginPatientHomeRoute(actor, "bedRest");
            return;
          }
          if (partner) {
            setWardWalkerSeatedLegs(actor.walker);
            actor.walker.arms[0].rotation.x = 0.45 + Math.sin(t * 3.2) * 0.16;
            actor.walker.arms[1].rotation.x = 0.36 + Math.sin(t * 2.8) * 0.1;
            actor.walker.headRig.rotation.x = Math.sin(t * 2.6) * 0.065;
            const targetYaw = thirdFloorPatientYaw(
                actor.walker.group.position,
                partner.walker.group.position,
              ),
              yawDelta = Math.atan2(
                Math.sin(targetYaw - actor.walker.group.rotation.y),
                Math.cos(targetYaw - actor.walker.group.rotation.y),
              );
            actor.walker.headRig.rotation.y = THREE.MathUtils.clamp(
              yawDelta,
              -0.42,
              0.42,
            );
          }
          if (
            actor.timer <= 0 &&
            actor.partner !== undefined &&
            actor.walker.group.userData.inpatientIndex < actor.partner
          ) {
            const partnerActor = inpatientPatients[actor.partner];
            const visitor = actor.conversationVisitor
                ? actor
                : partnerActor,
              host = actor.conversationVisitor ? partnerActor : actor;
            actor.partner = undefined;
            partnerActor.partner = undefined;
            host.state = "courtyardSit";
            host.timer = host.pausedCourtyardRest + 3;
            host.pausedCourtyardRest = 0;
            host.conversationVisitor = false;
            visitor.pausedCourtyardRest = 0;
            visitor.conversationVisitor = false;
            // The later arrival leaves in this frame. It may return directly
            // or take one additional safe lap; either route can meet another
            // seated patient, while pair memory prevents rejoining this host.
            beginPatientHomeRoute(visitor, "bedRest", careRandom() < 0.42);
          }
          return;
        }
        if (actor.state === "waitingCheck") {
          applySupinePatientPose(actor, t, false);
          actor.walker.headRig.rotation.y = Math.sin(t * 1.2) * 0.02;
          return;
        }
        if (actor.state === "beingChecked") {
          applySupinePatientPose(actor, t, false);
          actor.walker.headRig.rotation.x = Math.sin(t * 1.8) * 0.035;
        }
      });

      maintainPatientActivityMix(dt, t);
      startOpportunisticSeatedConversation(dt, t);

      if (inspectionPhase === "idle") {
        const medicationCycleComplete =
          !medicationTripOpen &&
          medicationQueue.length === 0 &&
          medicationRobot.mode === "home";
        if (medicationCycleComplete) inspectionTimer -= dt;
        if (inspectionTimer <= 0) {
          inspectionTripTargetCount =
            2 + ((inspectionNurseIndex + inpatientTaskSequence) % 2);
          inspectionTripCompleted = 0;
          inspectionTripVisited.clear();
          inspectionPreviousSlot = undefined;
          const choice = chooseInspectionPatient();
          if (choice) {
            medicationTripOpen = true;
            medicationTripClosed = false;
            medicationTripEnqueued = 0;
            medicationTripCompleted = 0;
            medicationQueue = [];
            inspectionPatient = choice.patient;
            reservePatientForInspection(choice.patient);
            inspectionPhase = "awaitPatient";
          }
        }
      }
      if (
        inspectionPhase === "awaitPatient" &&
        inspectionPatient &&
        ["waitingCheck", "bedEat"].includes(inspectionPatient.state)
      ) {
        const inspectionNurse = wardNurses[inspectionNurseIndex];
        if (inspectionTripCompleted === 0)
          startNurseInspectionRoute(inspectionNurse, inspectionPatient);
        else if (inspectionPreviousSlot)
          startNurseNextInspectionRoute(
            inspectionNurse,
            inspectionPreviousSlot,
            inspectionPatient,
          );
      }
      if (
        inspectionPhase === "awaitBedsideSupine" &&
        inspectionPatient?.state === "waitingCheck"
      ) {
        // Re-enter the already-completed outbound state with an empty route;
        // the next nurse update performs the bedside turn and starts checking.
        wardNurses[inspectionNurseIndex].mode = "outbound";
        inspectionPhase = "outbound";
      }

      wardNurses.forEach((nurse) => {
        nurse.navigationOverride = Math.max(
          0,
          nurse.navigationOverride - dt,
        );
        if (nurse.mode === "outbound" || nurse.mode === "returning") {
          if (
            actorHorizontalDistance(
              nurse.walker.group.position,
              nurse.motionWatchPosition,
            ) > 0.1
          ) {
            nurse.motionWatchPosition.copy(nurse.walker.group.position);
            nurse.motionStallTime = 0;
          } else nurse.motionStallTime += dt;
          if (nurse.motionStallTime > 1.8) {
            const nurseKey = `n:${nurse.index}`;
            const nearCourtyardGlass =
              nurse.walker.group.userData.blockedByCourtyardGlass === true ||
              !isNurseClearOfCourtyardGlass(
                nurse.walker.group.position,
                0.92,
              ) ||
              (nurse.cartAttached &&
                !isNurseClearOfCourtyardGlass(nurse.cart.position, 0.92));
            const glassDetourInserted =
              nearCourtyardGlass &&
              insertNurseCourtyardGlassDetour(nurse);
            wardDoorReservations.forEach((reservation) => {
              reservation.occupants.delete(nurseKey);
              if (reservation.occupants.size === 0)
                reservation.direction = undefined;
            });
            // Glass obstruction gets a real exterior detour. Door ownership
            // and transient character proxies still use the short priority
            // release, but that override never bypasses glass geometry.
            nurse.navigationOverride = glassDetourInserted ? 0 : 1.35;
            nurse.blockedTime = 0;
            nurse.motionStallTime = 0;
            nurse.motionWatchPosition.copy(nurse.walker.group.position);
          }
          moveWardNurse(nurse, dt, t);
          return;
        }
        if (nurse.mode === "checking") {
          nurse.timer += dt;
          nurse.walker.arms[0].rotation.x = 0.78 + Math.sin(t * 3.1) * 0.12;
          nurse.walker.arms[1].rotation.x = 0.62 + Math.sin(t * 2.7) * 0.1;
          nurse.walker.headRig.rotation.x = 0.08 + Math.sin(t * 2.2) * 0.04;
          if (nurse.timer >= inspectionCheckDuration)
            completeNurseCheck(nurse);
          return;
        }
        if (nurse.mode === "waitingNext") {
          nurse.walker.legs.forEach((leg) => leg.rotation.set(0, 0, 0));
          nurse.walker.arms.forEach((arm, armIndex) =>
            arm.rotation.set(0.72, 0, armIndex ? -0.18 : 0.18),
          );
          nurse.walker.headRig.rotation.y = Math.sin(t * 1.5) * 0.04;
          return;
        }
        const job = currentNurseStationJob(nurse.index),
          // Work duties rotate, seats do not. Each nurse returns to the chair
          // identified by their own index and performs the current assignment
          // there; only the active inspection nurse leaves the station.
          target = wardNurseSeatPoints[nurse.index],
          distance = actorHorizontalDistance(
            nurse.walker.group.position,
            target,
          );
        if (distance > 0.08) {
          const direction = target
              .clone()
              .sub(nurse.walker.group.position)
              .setY(0)
              .normalize(),
            step = Math.min(distance, dt * wardNurseWalkSpeed);
          setWardWalkerStanding(
            nurse.walker,
            thirdFloorYaw(nurse.walker.group.position, target),
          );
          nurse.walker.group.position.addScaledVector(direction, step);
          const gait = Math.sin(t * 7 + nurse.index);
          nurse.walker.legs[0].rotation.x = gait * 0.35;
          nurse.walker.legs[1].rotation.x = -gait * 0.35;
          nurse.walker.arms[0].rotation.set(-gait * 0.3, 0, 0.05);
          nurse.walker.arms[1].rotation.set(gait * 0.3, 0, -0.05);
          if (nurse.walker.chart) nurse.walker.chart.visible = false;
        } else if (job === "computer") {
          nurse.walker.group.position.copy(target);
          setWardWalkerSeated(nurse.walker, 0, 0.14);
          nurse.walker.arms[0].rotation.x = 0.86 + Math.sin(t * 5.4) * 0.09;
          nurse.walker.arms[1].rotation.x = 0.86 - Math.sin(t * 5.4) * 0.09;
          nurse.walker.headRig.rotation.x = 0.08;
          if (nurse.walker.chart) nurse.walker.chart.visible = false;
        } else if (job === "chart") {
          nurse.walker.group.position.copy(target);
          setWardWalkerSeated(nurse.walker, 0, 0.14);
          if (nurse.walker.chart) nurse.walker.chart.visible = true;
          nurse.walker.arms[0].rotation.x = 0.74;
          nurse.walker.arms[1].rotation.x = 0.74;
          nurse.walker.headRig.rotation.x = 0.16 + Math.sin(t * 1.9) * 0.04;
        } else {
          nurse.walker.group.position.copy(target);
          setWardWalkerSeated(nurse.walker, 0, 0.14);
          if (nurse.walker.chart) nurse.walker.chart.visible = false;
        }
      });

      updateMedicationRobot(dt, t);

      wardSwingDoors.forEach((door, doorIndex) => {
        const centre = wardBedSlots.find(
          (slot) => slot.doorIndex === doorIndex,
        )?.doorCentre;
        if (!centre) return;
        const movingNear =
          inpatientPatients.some(
            (patient) =>
              ["rising", "walking"].includes(patient.state) &&
              actorHorizontalDistance(patient.walker.group.position, centre) <
                2.05,
          ) ||
          wardNurses.some(
            (nurse) =>
              ["outbound", "returning"].includes(nurse.mode) &&
              actorHorizontalDistance(nurse.walker.group.position, centre) <
                2.15,
          ) ||
          (medicationRobot.mode !== "home" &&
            actorHorizontalDistance(medicationRobot.group.position, centre) <
              2.05);
        if (movingNear) door.openTarget = 1;
        else if (door.openAmount > 0.04) door.openTarget = 0;
      });
    };


  return {
    inpatientPatients,
    wardNurses,
    patientCurrentStatus,
    wardNurseStatus,
    medicationRobotStatus,
    updateThirdFloorCare,
  };
}

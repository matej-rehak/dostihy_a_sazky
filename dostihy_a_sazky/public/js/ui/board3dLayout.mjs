// 3D board geometry layout helpers

export function getBoard3DSide(spaceId) {
  if ([0, 10, 20, 30].includes(spaceId)) return 'corner';
  if (spaceId >= 1 && spaceId <= 9) return 'bottom';
  if (spaceId >= 11 && spaceId <= 19) return 'left';
  if (spaceId >= 21 && spaceId <= 29) return 'top';
  if (spaceId >= 31 && spaceId <= 39) return 'right';
  return 'unknown';
}

export function getBoard3DSpacePosition(spaceId) {
  // Corners
  if (spaceId === 0) return { x: 5, z: 5, rotationY: 0 };
  if (spaceId === 10) return { x: -5, z: 5, rotationY: Math.PI / 2 };
  if (spaceId === 20) return { x: -5, z: -5, rotationY: Math.PI };
  if (spaceId === 30) return { x: 5, z: -5, rotationY: -Math.PI / 2 };

  // Bottom edge (1-9)
  if (spaceId >= 1 && spaceId <= 9) {
    return { x: 5 - spaceId, z: 5, rotationY: 0 };
  }
  // Left edge (11-19)
  if (spaceId >= 11 && spaceId <= 19) {
    return { x: -5, z: 15 - spaceId, rotationY: Math.PI / 2 };
  }
  // Top edge (21-29)
  if (spaceId >= 21 && spaceId <= 29) {
    return { x: spaceId - 25, z: -5, rotationY: Math.PI };
  }
  // Right edge (31-39)
  if (spaceId >= 31 && spaceId <= 39) {
    return { x: 5, z: spaceId - 35, rotationY: -Math.PI / 2 };
  }

  return { x: 0, z: 0, rotationY: 0 };
}

export function getPawn3DOffset(idx, total) {
  if (total <= 1) return { x: 0, z: 0 };
  if (total === 2) {
    return idx === 0 ? { x: -0.18, z: 0 } : { x: 0.18, z: 0 };
  }
  if (total === 3) {
    if (idx === 0) return { x: -0.18, z: -0.18 };
    if (idx === 1) return { x: 0.18, z: -0.18 };
    return { x: 0, z: 0.18 };
  }
  
  // Arrange in columns/rows for 4 or more players
  const cols = Math.ceil(total / 2);
  const row = Math.floor(idx / cols);
  const col = idx % cols;
  
  const dx = (col - (cols - 1) / 2) * 0.36;
  const dz = (row - 0.5) * 0.36;
  
  return { x: dx, z: dz };
}

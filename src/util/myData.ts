const vertex = new Float32Array([
    // float3 position
    // face1
    +1, -1, +1,
    -1, -1, +1,
    -1, -1, -1,
    +1, -1, -1,
    +1, -1, +1,
    -1, -1, -1,
    // face2
    +1, +1, +1,
    +1, -1, +1,
    +1, -1, -1,
    +1, +1, -1,
    +1, +1, +1,
    +1, -1, -1,
    // face3
    -1, +1, +1,
    +1, +1, +1,
    +1, +1, -1,
    -1, +1, -1,
    -1, +1, +1,
    +1, +1, -1,
    // face4
    -1, -1, +1,
    -1, +1, +1,
    -1, +1, -1,
    -1, -1, -1,
    -1, -1, +1,
    -1, +1, -1,
    // face5
    +1, +1, +1,
    -1, +1, +1,
    -1, -1, +1,
    -1, -1, +1,
    +1, -1, +1,
    +1, +1, +1,
    // face6
    +1, -1, -1,
    -1, -1, -1,
    -1, +1, -1,
    +1, +1, -1,
    +1, -1, -1,
    -1, +1, -1,
])
const vertexCount = 36

export {vertex, vertexCount}
import vertexShaderRaw from "./shaders/myShader-Lesson1-4.vert.wgsl?raw"
import fragmentShaderRaw from "./shaders/myShader-Lesson1-4.frag.wgsl?raw"
import { vertex, vertexCount } from "./util/myData"
import {mat4, vec3} from 'gl-matrix'

// ===== ===== ===== Arguments ===== ===== =====
const CUBES_NUM = 100

// ===== ===== ===== Initialize WebGPU ===== ===== =====
async function initWebGPU() {
    const canvas = document.querySelector('canvas')
    if(!canvas) throw new Error('Canvas is null')

    if(!navigator.gpu) {
        throw new Error('Not support WebGPU.')
    }
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance' // 这里只是一个期望选项
    })
    if(!adapter) {
        throw new Error('Adapter is null.')
    }
    const device = await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize
        }
    })
    console.log(adapter, device)
    
    const context = canvas.getContext('webgpu') as GPUCanvasContext
    const format = navigator.gpu.getPreferredCanvasFormat()
    canvas.width = canvas.clientWidth * window.devicePixelRatio,
    canvas.height = canvas.clientHeight * window.devicePixelRatio
    context.configure({
        device,
        format,
    });

    // console.log(format)

    // 这是JSON在JS中的一个简写方式
    // 如果key名和value名一致，可以省略key，只写value
    const size = {width: canvas.width, height: canvas.height}
    return {adapter, device, context, format, size}
}

// 想在管线中传入数据，需要有以下这几步
// 1. 定义数据
// 1.1 定义TypedArray
// 1.2 定义Buffer (size, usage)
// 1.3 写入Buffer (device.queue.writeBuffer)
// 2. 修改Pipeline
// 2.1 修改Pipeline的属性，设置解析方式
// 3. 在draw时进行使用
// 3.1 传入对应location (setVertexBuffer)
// 3.2 在draw时指定绘制的顶点个数

// ===== ===== ===== Initialize Pipeline ===== ===== =====
async function initPipeline(device: GPUDevice, format: GPUTextureFormat, size: {width: number, height: number}) {
    // ===== Pipeline =====
    const descriptor: GPURenderPipelineDescriptor = {
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({
                code: vertexShaderRaw
            }),
            entryPoint: 'main',
            // 这里的buffers可以使用多个slots，表示js中需要传入的多个TypedArray
            // 这里的attributes也可以有多个，表示每个TypedArray被划分到不同的location
            buffers: [{
                arrayStride: 3 * 4, // 因为每个顶点有3个数字，所以步长为3
                attributes: [{
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32x3',
                }],
            }]
        },
        fragment: {
            module: device.createShaderModule({
                code: fragmentShaderRaw
            }),
            entryPoint: 'main',
            targets: [{
                format,
            }],
        },
        primitive: {
            topology: 'triangle-list',
            // cullMode: 'back', // 因为正方体是封闭的，所以通过这个封闭的图形，来从几何上剔除内部
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
        }
    }

    const pipeline = await device.createRenderPipelineAsync(descriptor)
    
    // ===== vertex =====
    // const vertex = new Float32Array([
    //     // xyz, uv, normal
    //     0, 0.5, 0,
    //     -0.5, -0.5, 0,
    //     0.5, -0.5, 0,
    // ])
    const vertexBuffer = device.createBuffer({
        size: vertex.byteLength, // 字节数: 9 * 4
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // COPY_DST表示这个Buffer可以被writeBuffer写入
    })
    device.queue.writeBuffer(vertexBuffer, 0, vertex)

    // ===== color =====
    const color = new Float32Array([
        1, 1, 1, 1,
    ])
    const colorBuffer = device.createBuffer({
        size: color.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, // UNIFORM只读且大小最大64KB; STORAGE可修改且WebGPU最大支持2GB
    })
    device.queue.writeBuffer(colorBuffer, 0, color)

    // ===== MVP =====
    const mvpMatrixBuffer = device.createBuffer({
        size: 4 * 4 * 4 * CUBES_NUM,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // ===== Depth =====
    const depthTexture = device.createTexture({
        size,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })

    // ===== Package =====
    const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: {
                buffer: colorBuffer,
            }
        }, {
            binding: 1,
            resource: {
                buffer: mvpMatrixBuffer,
            }
        }]
    })

    const vertexObject = {
        vertex,
        vertexBuffer,
        // vertexCount: 3,
        vertexCount,
    }
    const colorObject = {
        color,
        colorBuffer,
    }

    const pipelineObject = {
        pipeline,
        vertexObject,
        colorObject,
        mvpMatrixBuffer,
        depthTexture,
        group,
    }

    return pipelineObject
}

// ===== 关于renderPass的效率问题 =====
// 1. setPipeline的效率消耗是最大的，因为它涉及到切换shaders、深度测试、图形组装、颜色混合等相关配置
// 2. setVertexBuffer的效率消耗是第二大的，因为这个API会根据管线配置来切换数据，shader内部也要生成对应的一些局部变量
// 3. setBindGroup的效率消耗是最小的，因为它只涉及到一些指针的切换
// 所以WebGPU应用，绘制多物体时，要优先选择切换bindGroup
// 当然，因为切换也要涉及内存指针，所以尽量不要切换
// ===== 如何优化 =====
// 在一个buffer里面塞多组数据，通过不同的offset和stride进行定位
// ===== BufferOffsetAlignment =====
// WebGPU标准要求，bufferOffset需要保留对齐的空间，目前最小offset为256
// 所以buffer里存的东西越少，越浪费显存，比如color(4*4bytes)需要16倍显存
// ===== Instance Draw =====
// instance draw 要求顶点数据格式相同
// ===== 核心! =====
// “尽量减少CPU和GPU的数据交换次数”

// ===== ===== ===== Draw ===== ===== =====
function draw(device: GPUDevice, context: GPUCanvasContext, pipelineObject: any) {
    // 因为createCommandEncoder这个API没有和GPU进行交互，所以它不是异步的
    const encoder = device.createCommandEncoder()

    // ===== 录制命令部分 =====
    // 下面这个API的Pass的概念类似于“图层”
    const renderPass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear', // 'clear'清空原有内容，'load'保留原有内容
            clearValue: {r:0, g:0, b:0, a:1}, // 'clear'时使用的颜色
            storeOp: 'store', // 'store'保留结果，'discard'清除原有信息
        }],
        depthStencilAttachment: {
            view: pipelineObject.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        }
    })
    renderPass.setPipeline(pipelineObject.pipeline)
    renderPass.setVertexBuffer(0, pipelineObject.vertexObject.vertexBuffer)
    renderPass.setBindGroup(0, pipelineObject.group)
    renderPass.draw(pipelineObject.vertexObject.vertexCount, CUBES_NUM) // Vertex会被并行地运行3次

    renderPass.end()

    const buffer = encoder.finish()
    // 将Command今天提交，这个时候上面的指令才会被真正执行
    // 因为Submit的结果将直接绘制在屏幕上，而不需要JS来接收执行结果，所以这个API也不是异步的
    device.queue.submit([buffer])

}

// ===== ===== ===== Get MVP Matrix ===== ===== =====
function getMVPMatrix(position: any, rotation: any, scale: any, aspect: number) {
    const modelViewMatrix = mat4.create()
    // translate
    mat4.translate(modelViewMatrix, modelViewMatrix, vec3.fromValues(position.x, position.y, position.z))
    // rotate
    mat4.rotateX(modelViewMatrix, modelViewMatrix, rotation.x)
    mat4.rotateY(modelViewMatrix, modelViewMatrix, rotation.y)
    mat4.rotateZ(modelViewMatrix, modelViewMatrix, rotation.z)
    // scale
    mat4.scale(modelViewMatrix, modelViewMatrix, vec3.fromValues(scale.x, scale.y, scale.z))

    const projectionMatrix = mat4.create()
    mat4.perspective(
        projectionMatrix,
        Math.PI / 2,
        aspect,
        // canvas.width / canvas.height,
        0.1,
        100)

    const mvpMatrix = mat4.create()
    mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix)

    return mvpMatrix
}

// ===== ===== ===== Main ===== ===== =====
async function run() {
    // ===== Initialize =====
    const {device, format, context, size} = await initWebGPU()
    const pipelineObject = await initPipeline(device, format, size)

    // ===== Draw =====
    const drawWithMVP = ()=>{
        // ===== Create MVP Matrix =====
        // get input value
        const x = +(document.getElementById('x') as HTMLInputElement)?.value
        const y = +(document.getElementById('y') as HTMLInputElement)?.value
        const z = +(document.getElementById('z') as HTMLInputElement)?.value
        // console.log(x, y, z)
        // rotate
        device.queue.writeBuffer(pipelineObject.mvpMatrixBuffer, 0, getMVPMatrix(
            {x:0, y:0, z:-3},
            {x, y, z},
            {x:1, y:1, z:1},
            size.width / size.height,
        ) as Float32Array)
        // write vertexBuffer
        device.queue.writeBuffer(pipelineObject.vertexObject.vertexBuffer, 0, pipelineObject.vertexObject.vertex)
        draw(device, context, pipelineObject)
    }
    drawWithMVP()

    // ===== Animation =====
    const fps = 165;
    // let count = 0;
    // let startTime = (new Date()).getTime()
    function frame() {
        let x = +(document.getElementById('x') as HTMLInputElement)?.value
        let y = +(document.getElementById('y') as HTMLInputElement)?.value
        let z = +(document.getElementById('z') as HTMLInputElement)?.value
        x = (x + 0.008 * 50 / fps)
        y = (y + 0.016 * 50 / fps)
        z = (z + 0.012 * 50 / fps)
        if(x >= 3.14) x -= 6.28
        if(y >= 3.14) y -= 6.28
        if(z >= 3.14) z -= 6.28
        document.getElementById('x')?.setAttribute('value', x.toString())
        document.getElementById('y')?.setAttribute('value', y.toString())
        document.getElementById('z')?.setAttribute('value', z.toString())
        drawWithMVP()

        // count += 1;
        // const endTime = (new Date()).getTime()
        // if(startTime + 1000 <= endTime) {
        //     console.log(count)
        //     count = 0
        //     startTime = endTime
        // }
        requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)

    // document.querySelectorAll('input[type="range"]')?.forEach((input) => {
    //     input.addEventListener('input', drawWithMVP)
    // })

    document.querySelector('input[type="color"]')?.addEventListener('input', (e: Event)=>{
        // get input color
        const color = (e.target as HTMLInputElement).value
        console.log(color)
        // parse hex color into rgb
        const r = +('0x' + color.slice(1, 3)) / 255
        const g = +('0x' + color.slice(3, 5)) / 255
        const b = +('0x' + color.slice(5, 7)) / 255
        pipelineObject.colorObject.color[0] = r
        pipelineObject.colorObject.color[1] = g
        pipelineObject.colorObject.color[2] = b
        // write colorBuffer
        device.queue.writeBuffer(pipelineObject.colorObject.colorBuffer, 0, pipelineObject.colorObject.color)
        draw(device, context, pipelineObject)
    })
}

run()

// // 检查浏览器是否支持WebGPU
// if(!navigator.gpu) {
//     throw new Error('not support webgpu')
// }

// const gpu = navigator.gpu
// document.body.innerHTML = '<h1>Hello WebGPU</h1>'

// // WebGPU的大部分API都是异步API
// async function initWebGPU() {
//     const adapter = await navigator.gpu.requestAdapter()
//     if(!adapter) {
//         throw new Error('No adapter found.')
//     }
//     const device = await adapter.requestDevice()
//     return adapter
// }
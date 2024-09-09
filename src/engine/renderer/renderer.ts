import { gl, lilgl } from "@/engine/renderer/lil-gl";
import { Camera } from "@/engine/renderer/camera";

import { Scene } from '@/engine/renderer/scene';
import {
  lightPovMvp, lightWorldPosition,
  modelviewProjection,
  normalMatrix, pointLightAttenuation, spotlightDirection, spotlightPosition, worldMatrix,
} from '@/engine/shaders/shaders';
import { EnhancedDOMPoint } from '@/engine/enhanced-dom-point';
import { ShadowCubeMapFbo } from '@/engine/renderer/cube-buffer-2';
import { lightInfo } from '@/light-info';

// IMPORTANT! The index of a given buffer in the buffer array must match it's respective data location in the shader.
// This allows us to use the index while looping through buffers to bind the attributes. So setting a buffer
// happens by placing
export const enum AttributeLocation {
  Positions,
  Normals,
  TextureCoords,
  TextureDepth,
  LocalMatrix,
  NormalMatrix = 8,
}

gl.enable(gl.CULL_FACE);
gl.enable(gl.DEPTH_TEST);
// gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');
const modelviewProjectionLocation = gl.getUniformLocation(lilgl.program, modelviewProjection)!;
const normalMatrixLocation =  gl.getUniformLocation(lilgl.program, normalMatrix)!;
const pointLightAttenuationLocation = gl.getUniformLocation(lilgl.program, pointLightAttenuation);
const spotlightPositionLocation = gl.getUniformLocation(lilgl.program, spotlightPosition)!;
const spotlightDirectionLocation = gl.getUniformLocation(lilgl.program, spotlightDirection)!;

const worldMatrixDepth = gl.getUniformLocation(lilgl.depthProgram, worldMatrix);
const lightPositionDepth = gl.getUniformLocation(lilgl.depthProgram, lightWorldPosition);
const lightPovMvpDepthLocation = gl.getUniformLocation(lilgl.depthProgram, lightPovMvp);

const worldMatrixMain = gl.getUniformLocation(lilgl.program, worldMatrix);
const lightPositionMain = gl.getUniformLocation(lilgl.program, lightWorldPosition);
// const shadowCubeMapMain = gl.getUniformLocation(lilgl.program, shadowCubeMap);


const lightPovMvpRenderLocation = gl.getUniformLocation(lilgl.program, lightPovMvp);
gl.useProgram(lilgl.program);

const depthTextureSize = new DOMPoint(4096, 4096);
const depthTexture = gl.createTexture();
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, depthTexture);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, depthTextureSize.x, depthTextureSize.y);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, 0x812F); // gl.CLAMP_TO_EDGE
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, 0x812F); // gl.CLAMP_TO_EDGE

// const depthFramebuffer = gl.createFramebuffer();
// gl.bindFramebuffer(gl.FRAMEBUFFER, depthFramebuffer);
// gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);


const lightPerspective = new Camera(Math.PI / 2, 1, 0.1, 60);

export function createLookAt(position: EnhancedDOMPoint, target: EnhancedDOMPoint, up: EnhancedDOMPoint) {
  const zAxis = new EnhancedDOMPoint().subtractVectors(target, position).normalize_(); //normalize(subtractVectors(target, position));
  const xAxis = new EnhancedDOMPoint().crossVectors(zAxis, up).normalize_(); //normalize(crossVectors(zAxis, up));
  const yAxis = new EnhancedDOMPoint().crossVectors(xAxis, zAxis); //crossVectors(xAxis, zAxis);

  const invertedZ = new EnhancedDOMPoint(zAxis.x * -1, zAxis.y * -1, zAxis.z * -1);

  return new DOMMatrix([
    xAxis.x, yAxis.x, invertedZ.x, 0,
    xAxis.y, yAxis.y, invertedZ.y, 0,
    xAxis.z, yAxis.z, invertedZ.z, 0,
    -xAxis.dot(position), -yAxis.dot(position), -invertedZ.dot(position), 1,
  ]);
}



const cubeMap = new ShadowCubeMapFbo(1024);
gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMap.cubeMapTexture);

export function render(camera: Camera, scene: Scene) {
  const viewMatrix = camera.worldMatrix.inverse();
  const viewProjectionMatrix = camera.projection.multiply(viewMatrix);

  // Render shadow map to depth texture
  gl.useProgram(lilgl.depthProgram);
  gl.disable(gl.BLEND);
  gl.uniform3fv(lightPositionDepth, lightInfo.pointLightPosition.toArray());

  cubeMap.getSides().forEach(side => {
    cubeMap.bindForWriting(side);

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const lightView = createLookAt(lightInfo.pointLightPosition, new EnhancedDOMPoint().addVectors(lightInfo.pointLightPosition, side.target), side.up);
    const lightViewProjectionMatrix = lightPerspective.projection.multiply(lightView);

    scene.solidMeshes.forEach((mesh, index) => {
      gl.bindVertexArray(mesh.geometry.vao!);
      gl.uniformMatrix4fv(worldMatrixDepth, false, mesh.worldMatrix.toFloat32Array());
      gl.uniformMatrix4fv(lightPovMvpDepthLocation, false, lightViewProjectionMatrix.multiply(mesh.worldMatrix).toFloat32Array());
      gl.drawElements(gl.TRIANGLES, mesh.geometry.getIndices()!.length, gl.UNSIGNED_SHORT, 0);
    });
  });

  gl.useProgram(lilgl.program);
  gl.enable(gl.BLEND);
  gl.uniform3fv(lightPositionMain, lightInfo.pointLightPosition.toArray());
  gl.uniform3fv(spotlightPositionLocation, lightInfo.spotLightPosition.toArray());
  gl.uniform3fv(spotlightDirectionLocation, lightInfo.spotLightDirection.toArray());
  gl.uniform3fv(pointLightAttenuationLocation, lightInfo.pointLightAttenuation.toArray());

  // Render solid meshes first
  gl.activeTexture(gl.TEXTURE0);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.cullFace(gl.BACK);
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // gl.uniform1i(shadowCubeMapMain, 2);

  scene.solidMeshes.forEach(mesh => {
    // @ts-ignore
    gl.useProgram(lilgl.program);
    const modelViewProjectionMatrix = viewProjectionMatrix.multiply(mesh.worldMatrix);

    gl.vertexAttrib1f(AttributeLocation.TextureDepth, mesh.material.texture?.id ?? -1.0);
    gl.bindVertexArray(mesh.geometry.vao!);

    // @ts-ignore
    gl.uniformMatrix4fv(normalMatrixLocation, true, mesh.color ? mesh.cachedMatrixData : mesh.worldMatrix.inverse().toFloat32Array());
    gl.uniformMatrix4fv(worldMatrixMain, false, mesh.worldMatrix.toFloat32Array());
    gl.uniformMatrix4fv(modelviewProjectionLocation, false, modelViewProjectionMatrix.toFloat32Array());
    gl.drawElements(gl.TRIANGLES, mesh.geometry.getIndices()!.length, gl.UNSIGNED_SHORT, 0);
  });

  // Unbinding the vertex array being used to make sure the last item drawn isn't still bound on the next draw call.
  // In theory this isn't necessary but avoids bugs.
  gl.bindVertexArray(null);
}

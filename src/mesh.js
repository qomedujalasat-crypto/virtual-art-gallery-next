'use strict';

const loadTexture = async (texture, url) => {
    const result = await fetch(url);
    const blob = await result.blob();
    const data = await createImageBitmap(blob);
    texture({data,
        wrapS: 'repeat',
        wrapT: 'repeat'
    });
};

module.exports = (regl, data, useReflexion) => {
    const wallTexture = regl.texture();
    const floorTexture = regl.texture();
    loadTexture(wallTexture, "res/wall.jpg");
    loadTexture(floorTexture, "res/floor.jpg");
    return regl({
        frag: `
        precision lowp float;
        varying vec3 v_pos, v_relativepos, v_normal;
        uniform sampler2D wallTexture;
        uniform sampler2D floorTexture;

        void main() {
            float dist = length(v_relativepos);
            vec3 totalLight;

            // Keep the ceiling plain white.
            if (v_normal.y < -0.5) {
                totalLight = vec3(0.97, 0.97, 0.96);
            } else if (v_normal.y > 0.5) {
                // Keep the marble floor muted so the artwork, not the room, draws attention.
                vec3 stone = vec3(0.76, 0.73, 0.68);
                vec3 textureColor = texture2D(floorTexture, v_pos.xz / 8.0).rgb;
                totalLight = mix(stone, textureColor, 0.06);
                float pattern = sin((v_pos.x + v_pos.z * 0.65) * 2.4
                    + sin(v_pos.x * 0.7 + v_pos.z * 0.3) * 2.0);
                float vein = pow(1.0 - abs(pattern), 18.0);
                totalLight = mix(totalLight, vec3(0.55, 0.52, 0.47), vein * 0.12);
            } else {
                // Deep warm taupe plaster with a restrained Persian-inspired geometric ornament.
                totalLight = vec3(0.49, 0.42, 0.35);

                // Repeating diamond lattice and small rosette-like crossings.
                // The muted sand-gold lines are intentionally low contrast.
                vec2 uv = vec2(v_pos.x + v_pos.z, v_pos.y) * 1.35;
                vec2 cell = abs(fract(uv) - 0.5);
                float diamondLine = abs(cell.x + cell.y - 0.36);
                float diagonalLine = abs(cell.x - cell.y);
                float diamond = 1.0 - smoothstep(0.012, 0.035, diamondLine);
                float crossing = 1.0 - smoothstep(0.018, 0.045, diagonalLine);
                float centerX = 1.0 - smoothstep(0.055, 0.09, length(cell - vec2(0.5, 0.5)));
                float ornament = max(diamond, crossing * 0.20);
                ornament = max(ornament, centerX * 0.12);

                vec3 ornamentColor = vec3(0.68, 0.52, 0.34);
                totalLight = mix(totalLight, ornamentColor, ornament * 0.22);

                // Gentle ambient shading, without bringing back the dark wall texture.
                totalLight *= mix(0.96, 1.0, smoothstep(0.1, 0.12, v_pos.y));
            }

            float alpha = .98 + smoothstep(150., 0., dist) - v_normal.y;
            gl_FragColor = vec4(totalLight, ${useReflexion ? "alpha" : "1.0"});
        }`,

        vert: `
        precision highp float;
        uniform mat4 proj, view;
        attribute vec3 position, normal;
        varying vec3 v_pos, v_relativepos, v_normal;
        uniform float yScale;
        void main() {
            vec3 pos = position;
            v_pos = pos;
            v_relativepos = (view * vec4(pos, 1)).xyz;
            pos.y *= yScale;
            v_normal = normal;
            gl_Position = proj * view * vec4(pos, 1);
        }`,

        attributes: {
            position: data.position,
            normal: data.normal
        },

        blend: useReflexion ? {
            enable: true,
            func: {
                src: 'src alpha',
                dst: 'one minus src alpha'
            },
        } : {},

        uniforms: {
            wallTexture,
            floorTexture
        },

        elements: new Uint32Array(data.elements)
    });
};

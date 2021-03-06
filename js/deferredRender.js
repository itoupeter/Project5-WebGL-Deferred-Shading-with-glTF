(function() {
    'use strict';
    // deferredSetup.js must be loaded first

    R.deferredRender = function(state) {
        if (!aborted && (
            !R.progCopy ||
            !R.progRed ||
            !R.progClear ||
            !R.prog_Ambient ||
            !R.prog_BlinnPhong_PointLight ||
            !R.prog_Debug ||
            !R.progPost1_1 ||
			!R.progPost1_2 ||
			!R.progPost1_3)) {
            console.log('waiting for programs to load...');
            return;
        }

        // Move the R.lights
        for (var i = 0; i < R.lights.length; i++) {
            // OPTIONAL TODO: Edit if you want to change how lights move
            var mn = R.light_min[1];
            var mx = R.light_max[1];
            R.lights[i].pos[1] = (R.lights[i].pos[1] + R.light_dt - mn + mx) % mx + mn;
        }

        // Execute deferred shading pipeline

        // CHECKITOUT: START HERE! You can even uncomment this:
        // debugger;

        // { // TODO: test rendering red screen
        //     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		// 	gl.useProgram(R.progRed.prog);
		// 	gl.uniform4fv(R.progRed.u_color, [1., 0., 0., 1.]);
        //     renderFullScreenQuad(R.progRed);
        //     return;
        // }

        R.pass_copy.render(state);

        if (cfg && cfg.debugView >= 0) {
            // Do a debug render in stead of a regular render
            // Don't do any post-processing in debug mode
            R.pass_debug.render(state);
        } else {
            // * Deferred pass and postprocessing pass(es)
            // TODO: uncomment these
            R.pass_deferred.render(state);
            R.pass_post1.render(state);
			if (cfg && cfg.debugScissor) {
				R.pass_scissor.render(state);
			}

            // OPTIONAL TODO: call more postprocessing passes, if any
        }
    };

    /**
     * 'copy' pass: Render into g-buffers
     */
    R.pass_copy.render = function(state) {
        // * Bind the framebuffer R.pass_copy.fbo
        // TODO: uncomment
        gl.bindFramebuffer(gl.FRAMEBUFFER,R.pass_copy.fbo);

        // * Clear screen using R.progClear
        // TODO: uncomment
        renderFullScreenQuad(R.progClear);

        // * Clear depth buffer to value 1.0 using gl.clearDepth and gl.clear
        // TODO: uncomment
        gl.clearDepth(1.0);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // * "Use" the program R.progCopy.prog
        // TODO: uncomment
        gl.useProgram(R.progCopy.prog);

        // TODO: Go write code in glsl/copy.frag.glsl

        var m = state.cameraMat.elements;
        // * Upload the camera matrix m to the uniform R.progCopy.u_cameraMat
        //   using gl.uniformMatrix4fv
        // TODO: uncomment
        gl.uniformMatrix4fv(R.progCopy.u_cameraMat, false, m);

        // * Draw the scene
        // TODO: uncomment
        drawScene(state);
    };

    var drawScene = function(state) {
        for (var i = 0; i < state.models.length; i++) {
            var m = state.models[i];

            // If you want to render one model many times, note:
            // readyModelForDraw only needs to be called once.
            readyModelForDraw(R.progCopy, m);
            drawReadyModel(m);
        }
    };

    R.pass_debug.render = function(state) {
        // * Unbind any framebuffer, so we can write to the screen
        // TODO: uncomment
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // * Bind/setup the debug "lighting" pass
        // * Tell shader which debug view to use
        // TODO: uncomment
        bindTexturesForLightPass(R.prog_Debug);
        gl.uniform1i(R.prog_Debug.u_debug, cfg.debugView);

        // * Render a fullscreen quad to perform shading on
        // TODO: uncomment
        renderFullScreenQuad(R.prog_Debug);
    };

    /**
     * 'deferred' pass: Add lighting results for each individual light
     */
    R.pass_deferred.render = function(state) {
        // * Bind R.pass_deferred.fbo to write into for later postprocessing
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.pass_deferred.fbo);

        // * Clear depth to 1.0 and color to black
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // * _ADD_ together the result of each lighting pass

        // Enable blending and use gl.blendFunc to blend with:
        //   color = 1 * src_color + 1 * dst_color
        // Here is a wonderful demo of showing how blend function works:
        // http://mrdoob.github.io/webgl-blendfunctions/blendfunc.html
        // TODO: uncomment
        gl.enable(gl.BLEND);
        gl.blendEquation( gl.FUNC_ADD );
        gl.blendFunc(gl.ONE,gl.ONE);

        // * Bind/setup the ambient pass, and render using fullscreen quad
        bindTexturesForLightPass(R.prog_Ambient);
        renderFullScreenQuad(R.prog_Ambient);

        // * Bind/setup the Blinn-Phong pass, and render using fullscreen quad
        bindTexturesForLightPass(R.prog_BlinnPhong_PointLight);

        // TODO: add a loop here, over the values in R.lights, which sets the
        //   uniforms R.prog_BlinnPhong_PointLight.u_lightPos/Col/Rad etc.,
        //   then does renderFullScreenQuad(R.prog_BlinnPhong_PointLight).
		gl.enable(gl.SCISSOR_TEST);
		for (var i = 0; i < R.NUM_LIGHTS; ++i) {
			var sc = getScissorForLight(state.viewMat, state.projMat, R.lights[i]);

			if (!sc) continue;
			gl.scissor(sc[0], sc[1], sc[2], sc[3]);
			gl.uniform3fv(R.prog_BlinnPhong_PointLight.u_lightPos, R.lights[i].pos);
			gl.uniform3fv(R.prog_BlinnPhong_PointLight.u_lightCol, R.lights[i].col);
			gl.uniform1f(R.prog_BlinnPhong_PointLight.u_lightRad, R.lights[i].rad);
			renderFullScreenQuad(R.prog_BlinnPhong_PointLight);

		}
		gl.disable(gl.SCISSOR_TEST);

        // TODO: In the lighting loop, use the scissor test optimization
        // Enable gl.SCISSOR_TEST, render all lights, then disable it.
        //
        // getScissorForLight returns null if the scissor is off the screen.
        // Otherwise, it returns an array [xmin, ymin, width, height].
        //
        //   var sc = getScissorForLight(state.viewMat, state.projMat, light);

        // Disable blending so that it doesn't affect other code
        gl.disable(gl.BLEND);
    };

    var bindTexturesForLightPass = function(prog) {
        gl.useProgram(prog.prog);

        // * Bind all of the g-buffers and depth buffer as texture uniform
        //   inputs to the shader
        for (var i = 0; i < R.NUM_GBUFFERS; i++) {
            gl.activeTexture(gl['TEXTURE' + i]);
            gl.bindTexture(gl.TEXTURE_2D, R.pass_copy.gbufs[i]);
            gl.uniform1i(prog.u_gbufs[i], i);
        }
        gl.activeTexture(gl['TEXTURE' + R.NUM_GBUFFERS]);
        gl.bindTexture(gl.TEXTURE_2D, R.pass_copy.depthTex);
        gl.uniform1i(prog.u_depth, R.NUM_GBUFFERS);
    };

    /**
     * 'post1' pass: Perform (first) pass of post-processing
     */
    R.pass_post1.render = function(state) {
		// compute color and extract bright color
		// gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, R.pass_post1.fbo1);
        gl.useProgram(R.progPost1_1.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, R.pass_deferred.colorTex);
        gl.uniform1i(R.progPost1_1.u_color, 0);
        renderFullScreenQuad(R.progPost1_1);

		// compute gaussian blur in horizontal direction
		gl.bindFramebuffer(gl.FRAMEBUFFER, R.pass_post1.fbo2);
		gl.useProgram(R.progPost1_2.prog);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, R.pass_post1.brightTex);
		gl.uniform1i(R.progPost1_2.u_bright, 0);
		gl.uniform1i(R.progPost1_2.u_horizontal, 1);
		gl.uniform4f(R.progPost1_2.u_weight, 0.1945946, 0.1216216, 0.054054, 0.016216);
		gl.uniform2f(R.progPost1_2.u_screenSize, R.width, R.height);
		renderFullScreenQuad(R.progPost1_2);

		// compute gaussian blur in vertical direction
		gl.bindFramebuffer(gl.FRAMEBUFFER, R.pass_post1.fbo3);
		gl.bindTexture(gl.TEXTURE_2D, R.pass_post1.blurredTex);
		gl.uniform1i(R.progPost1_2.u_horizontal, 0);
		renderFullScreenQuad(R.progPost1_2);

		// combine color and blurred bright color
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.useProgram(R.progPost1_3.prog);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, R.pass_post1.colorTex);
		gl.uniform1i(R.progPost1_3.u_color, 0);
		gl.activeTexture(gl.TEXTURE1);
		if (cfg && cfg.enableEffect0) {
			gl.bindTexture(gl.TEXTURE_2D, R.pass_post1.brightTex);
		} else {
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
		gl.uniform1i(R.progPost1_3.u_bright, 1);
		renderFullScreenQuad(R.progPost1_3);
    };

	R.pass_scissor.render = function(state) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.useProgram(R.progRed.prog);
		gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		for (var i = 0; i < R.NUM_LIGHTS; ++i) {
			var sc = getScissorForLight(state.viewMat, state.projMat, R.lights[i]);

			if (!sc) continue;

			var minX = sc[0] / R.width * 2. - 1.;
			var maxX = (sc[0] + sc[2]) / R.width * 2. - 1.;
			var minY = sc[1] / R.height * 2. - 1.;
			var maxY = (sc[1] + sc[3]) / R.height * 2. - 1.;
			var rect = new Float32Array([
				minX, minY, 0.,
				maxX, minY, 0.,
				minX, maxY, 0.,
				maxX, maxY, 0.
			]);

			gl.useProgram(R.progRed.prog);
			gl.uniform4fv(R.progRed.u_color, [1., 0., 0., .05]);
			renderFullScreenQuad(R.progRed, rect);
		}
		gl.disable(gl.BLEND);
	};

    var renderFullScreenQuad = (function() {
        // The variables in this function are private to the implementation of
        // renderFullScreenQuad. They work like static local variables in C++.

        // Create an array of floats, where each set of 3 is a vertex position.
        // You can render in normalized device coordinates (NDC) so that the
        // vertex shader doesn't have to do any transformation; draw two
        // triangles which cover the screen over x = -1..1 and y = -1..1.
        // This array is set up to use gl.drawArrays with gl.TRIANGLE_STRIP.
        var positions = new Float32Array([
            -1.0, -1.0, 0.0,
             1.0, -1.0, 0.0,
            -1.0,  1.0, 0.0,
             1.0,  1.0, 0.0
        ]);

        var vbo = null;

        var init = function() {
            // Create a new buffer with gl.createBuffer, and save it as vbo.
            // TODO: uncomment
            vbo = gl.createBuffer();

            // Bind the VBO as the gl.ARRAY_BUFFER
            // TODO: uncomment
            gl.bindBuffer(gl.ARRAY_BUFFER,vbo);

            // Upload the positions array to the currently-bound array buffer
            // using gl.bufferData in static draw mode.
            // TODO: uncomment
            gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STATIC_DRAW);
        };

        return function(prog, rect = null) {
			if (!vbo) {
                // If the vbo hasn't been initialized, initialize it.
                init();
            }

            // Bind the program to use to draw the quad
            gl.useProgram(prog.prog);

            // Bind the VBO as the gl.ARRAY_BUFFER
            // TODO: uncommentif (rect) {
			if (rect) {
				var vbo_rect = gl.createBuffer();

				gl.bindBuffer(gl.ARRAY_BUFFER, vbo_rect);
				gl.bufferData(gl.ARRAY_BUFFER, rect, gl.STATIC_DRAW);
	            gl.bindBuffer(gl.ARRAY_BUFFER, vbo_rect);
			} else {
				gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
			}

            // Enable the bound buffer as the vertex attrib array for
            // prog.a_position, using gl.enableVertexAttribArray
            // TODO: uncomment
            gl.enableVertexAttribArray(prog.a_position);

            // Use gl.vertexAttribPointer to tell WebGL the type/layout for
            // prog.a_position's access pattern.
            // TODO: uncomment
            gl.vertexAttribPointer(prog.a_position, 3, gl.FLOAT, gl.FALSE, 0, 0);

            // Use gl.drawArrays (or gl.drawElements) to draw your quad.
            // TODO: uncomment
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            // Unbind the array buffer.
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        };
    })();
})();

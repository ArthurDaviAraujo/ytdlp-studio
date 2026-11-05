# Motor das IAs do celular: ncnn (Vulkan) + RIFE + Real-ESRGAN numa biblioteca só (libaiengine.so)
cmake_minimum_required(VERSION 3.22)
project(aiengine)

set(CMAKE_CXX_STANDARD 17)

# ncnn pré-compilado para Android com Vulkan (github.com/Tencent/ncnn, release 20261020)
set(ncnn_DIR ${CMAKE_CURRENT_SOURCE_DIR}/ncnn/${ANDROID_ABI}/lib/cmake/ncnn)
find_package(ncnn REQUIRED)

# Os shaders vão como texto e são compilados na placa do celular na hora (compile_spirv_module)
macro(add_shader SRC)
    get_filename_component(NAME_WE ${SRC} NAME_WE)
    set(HEADER ${CMAKE_CURRENT_BINARY_DIR}/${NAME_WE}.comp.hex.h)
    add_custom_command(
        OUTPUT ${HEADER}
        COMMAND ${CMAKE_COMMAND} -DSHADER_SRC=${CMAKE_CURRENT_SOURCE_DIR}/${SRC} -DSHADER_COMP_HEADER=${HEADER} -P ${CMAKE_CURRENT_SOURCE_DIR}/generate_shader_comp_header.cmake
        DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/${SRC}
        VERBATIM)
    list(APPEND SHADER_HEADERS ${HEADER})
endmacro()

foreach(S rife_preproc rife_postproc rife_preproc_tta rife_postproc_tta rife_flow_tta_avg rife_v2_flow_tta_avg rife_v4_flow_tta_avg
          rife_flow_tta_temporal_avg rife_v2_flow_tta_temporal_avg rife_v4_flow_tta_temporal_avg rife_out_tta_temporal_avg
          rife_v4_timestep rife_v4_timestep_tta warp warp_pack4 warp_pack8)
    add_shader(rife/${S}.comp)
endforeach()
add_shader(esrgan/realesrgan_preproc.comp)
add_shader(esrgan/realesrgan_postproc.comp)
add_custom_target(shaders DEPENDS ${SHADER_HEADERS})

add_library(aiengine SHARED jni.cpp rife/rife.cpp rife/warp.cpp esrgan/realesrgan.cpp)
add_dependencies(aiengine shaders)
target_include_directories(aiengine PRIVATE ${CMAKE_CURRENT_BINARY_DIR} rife esrgan)
target_link_libraries(aiengine ncnn android log)

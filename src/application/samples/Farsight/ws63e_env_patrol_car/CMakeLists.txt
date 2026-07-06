set(SOURCES_LIST
    ${CMAKE_CURRENT_SOURCE_DIR}/board/car_board.c
    ${CMAKE_CURRENT_SOURCE_DIR}/drivers/i2c_bus.c
    ${CMAKE_CURRENT_SOURCE_DIR}/sensors/aht20.c
    ${CMAKE_CURRENT_SOURCE_DIR}/sensors/bh1750.c
    ${CMAKE_CURRENT_SOURCE_DIR}/display/oled_status.c
    ${CMAKE_CURRENT_SOURCE_DIR}/motor/car_motor.c
    ${CMAKE_CURRENT_SOURCE_DIR}/patrol/patrol_route.c
    ${CMAKE_CURRENT_SOURCE_DIR}/comm/telemetry.c
    ${CMAKE_CURRENT_SOURCE_DIR}/comm/control_command.c
    ${CMAKE_CURRENT_SOURCE_DIR}/comm/wifi_ap.c
    ${CMAKE_CURRENT_SOURCE_DIR}/comm/sle_client.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../she_docs/ssd1306.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../she_docs/ssd1306_fonts.c
    ${CMAKE_CURRENT_SOURCE_DIR}/app_main.c
)
set(HEADER_LIST
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/board
    ${CMAKE_CURRENT_SOURCE_DIR}/drivers
    ${CMAKE_CURRENT_SOURCE_DIR}/model
    ${CMAKE_CURRENT_SOURCE_DIR}/sensors
    ${CMAKE_CURRENT_SOURCE_DIR}/display
    ${CMAKE_CURRENT_SOURCE_DIR}/motor
    ${CMAKE_CURRENT_SOURCE_DIR}/patrol
    ${CMAKE_CURRENT_SOURCE_DIR}/comm
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../she_docs
)

set(SOURCES "${SOURCES}" ${SOURCES_LIST} PARENT_SCOPE)
set(PUBLIC_HEADER "${PUBLIC_HEADER}" ${HEADER_LIST} PARENT_SCOPE)

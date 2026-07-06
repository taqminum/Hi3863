#===============================================================================
# @brief    cmake file for WS63E Environment Gateway
# Copyright (c) CompanyNameMagicTag 2023-2023. All rights reserved.
#===============================================================================

set(SOURCES_LIST
    ${CMAKE_CURRENT_SOURCE_DIR}/sle_uart_server_adv.c
    ${CMAKE_CURRENT_SOURCE_DIR}/sle_uart_server.c
    ${CMAKE_CURRENT_SOURCE_DIR}/wifi_softap.c
    ${CMAKE_CURRENT_SOURCE_DIR}/telemetry_cache.c
    ${CMAKE_CURRENT_SOURCE_DIR}/udp_bridge.c
    ${CMAKE_CURRENT_SOURCE_DIR}/gateway_main.c
)

set(HEADER_LIST
    ${CMAKE_CURRENT_SOURCE_DIR}
)

set(SOURCES "${SOURCES}" ${SOURCES_LIST} PARENT_SCOPE)
set(PUBLIC_HEADER "${PUBLIC_HEADER}" ${HEADER_LIST} PARENT_SCOPE)

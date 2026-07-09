#ifndef SLE_RSSI_LINK_STATE_H
#define SLE_RSSI_LINK_STATE_H

#include <stdint.h>

typedef struct {
    uint16_t conn_id;
    uint8_t connected;
} sle_rssi_link_state_t;

void sle_rssi_link_state_init(sle_rssi_link_state_t *state);

void sle_rssi_link_state_on_connect(sle_rssi_link_state_t *state, uint16_t conn_id);

void sle_rssi_link_state_on_disconnect(sle_rssi_link_state_t *state);

int sle_rssi_link_state_has_connection(const sle_rssi_link_state_t *state);

uint16_t sle_rssi_link_state_conn_id(const sle_rssi_link_state_t *state);

#endif

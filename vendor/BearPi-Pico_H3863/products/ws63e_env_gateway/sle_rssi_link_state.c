#include "sle_rssi_link_state.h"

void sle_rssi_link_state_init(sle_rssi_link_state_t *state)
{
    if (state == 0) {
        return;
    }
    state->conn_id = 0;
    state->connected = 0;
}

void sle_rssi_link_state_on_connect(sle_rssi_link_state_t *state, uint16_t conn_id)
{
    if (state == 0) {
        return;
    }
    state->conn_id = conn_id;
    state->connected = 1;
}

void sle_rssi_link_state_on_disconnect(sle_rssi_link_state_t *state)
{
    if (state == 0) {
        return;
    }
    state->connected = 0;
}

int sle_rssi_link_state_has_connection(const sle_rssi_link_state_t *state)
{
    if (state == 0) {
        return 0;
    }
    return state->connected == 0 ? 0 : 1;
}

uint16_t sle_rssi_link_state_conn_id(const sle_rssi_link_state_t *state)
{
    if (state == 0) {
        return 0;
    }
    return state->conn_id;
}

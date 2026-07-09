#include <assert.h>
#include <stdio.h>

#include "sle_rssi_link_state.h"

int main(void)
{
    sle_rssi_link_state_t state;

    sle_rssi_link_state_init(&state);
    assert(sle_rssi_link_state_has_connection(&state) == 0);

    sle_rssi_link_state_on_connect(&state, 0);
    assert(sle_rssi_link_state_has_connection(&state) == 1);
    assert(sle_rssi_link_state_conn_id(&state) == 0);

    sle_rssi_link_state_on_disconnect(&state);
    assert(sle_rssi_link_state_has_connection(&state) == 0);

    puts("sle_rssi_link_state_test passed");
    return 0;
}

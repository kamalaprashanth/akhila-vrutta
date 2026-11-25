package in.kp.akhilavrutta;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AkhilaNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Keeps balances off the recent-apps screen (a blank card instead), and out of screenshots and
        // screen recordings. Asked for by the owner, knowing it blocks screenshots inside the app.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
